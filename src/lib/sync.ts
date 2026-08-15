import { createClient } from '@/lib/supabase/client';
import type { Account, Position, Snapshot, Trade, Transfer, TargetAllocation, Lot, PriceSnapshot } from '@/types';
import type { EconomicEvent } from '@/lib/domain/events';

export interface CloudSyncMeta {
  schemaVersion: number;
  revision: number;
  deviceId: string;
  updatedAt: string;
}

export interface CloudSyncData {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  targetAllocations: TargetAllocation[];
  lots: Lot[];
  priceSnapshots?: PriceSnapshot[];
  economicEvents?: EconomicEvent[];
}

export interface CloudSyncPackage {
  meta: CloudSyncMeta;
  data: CloudSyncData;
}

export interface CloudSyncRecord {
  data: CloudSyncData;
  updatedAt: string | null;
  meta?: CloudSyncMeta | null;
}

export interface SyncDiffSummary {
  accounts: { added: number; removed: number; modified: number };
  positions: { added: number; removed: number; modified: number };
  trades: { added: number; removed: number; modified: number };
  transfers: { added: number; removed: number; modified: number };
  snapshots: { added: number; removed: number; modified: number };
}

export interface SyncConflict {
  reason: 'both_dirty' | 'cloud_newer' | 'local_newer';
  localMeta: CloudSyncMeta;
  cloudMeta: CloudSyncMeta;
  summary: SyncDiffSummary;
}

export interface LocalSyncState {
  schemaVersion: number;
  revision: number;
  deviceId: string;
  lastSyncedRevision: number;
  lastCloudRevision: number;
  dirty: boolean;
  updatedAt: string;
}

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('[CloudSync] Missing Supabase public env vars');
    return null;
  }

  return { url, anonKey };
}

/**
 * Per-user authenticated Supabase client.
 *
 * Returns null if the user is not logged in — callers MUST treat this as a
 * no-op (no cloud sync happens for anonymous visitors).
 */
async function getAuthedClient(): Promise<{ client: ReturnType<typeof createClient>; userId: string } | null> {
  if (!getSupabaseConfig()) return null;

  const client = createClient();

  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user) return null;

  return { client, userId: data.session.user.id };
}

function nextMeta(previous?: CloudSyncMeta | null): CloudSyncMeta {
  return {
    schemaVersion: 1,
    revision: (previous?.revision || 0) + 1,
    deviceId: previous?.deviceId || 'unknown-device',
    updatedAt: new Date().toISOString(),
  };
}

export function createSyncPackage(data: CloudSyncData, previous?: CloudSyncMeta | null): CloudSyncPackage {
  return { meta: nextMeta(previous), data };
}

function countObjects<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function diffCollection<T extends { id: string }>(local: T[], remote: T[]) {
  const localMap = countObjects(local);
  const remoteMap = countObjects(remote);
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const [id, item] of remoteMap.entries()) {
    const localItem = localMap.get(id);
    if (!localItem) added += 1;
    else if (JSON.stringify(localItem) !== JSON.stringify(item)) modified += 1;
  }

  for (const id of localMap.keys()) {
    if (!remoteMap.has(id)) removed += 1;
  }

  return { added, removed, modified };
}

export function summarizeSyncDiff(local: CloudSyncData, remote: CloudSyncData): SyncDiffSummary {
  return {
    accounts: diffCollection(local.accounts, remote.accounts),
    positions: diffCollection(local.positions, remote.positions),
    trades: diffCollection(local.trades, remote.trades),
    transfers: diffCollection(local.transfers, remote.transfers),
    snapshots: diffCollection(local.snapshots, remote.snapshots),
  };
}

export function detectSyncConflict(params: {
  localMeta: LocalSyncState;
  cloudMeta: CloudSyncMeta;
  localData: CloudSyncData;
  cloudData: CloudSyncData;
}): SyncConflict | null {
  const localChanged = params.localMeta.dirty || params.localMeta.revision !== params.localMeta.lastSyncedRevision;
  const cloudChanged = params.cloudMeta.revision !== params.localMeta.lastCloudRevision;

  if (!localChanged && !cloudChanged) return null;

  if (localChanged && cloudChanged) {
    return {
      reason: 'both_dirty',
      localMeta: {
        schemaVersion: params.localMeta.schemaVersion,
        revision: params.localMeta.revision,
        deviceId: params.localMeta.deviceId,
        updatedAt: params.localMeta.updatedAt,
      },
      cloudMeta: params.cloudMeta,
      summary: summarizeSyncDiff(params.localData, params.cloudData),
    };
  }

  return null;
}

export async function syncToCloud(data: CloudSyncData, meta?: CloudSyncMeta): Promise<boolean> {
  try {
    const authed = await getAuthedClient();
    if (!authed) {
      console.log('[CloudSync] No active session, skipping sync');
      return false;
    }

    return await upsertCloudData(authed.userId, data, meta);
  } catch (error) {
    console.error('[CloudSync] Failed to sync to cloud:', error);
    return false;
  }
}

export async function syncToCloudForUser(data: CloudSyncData, userId: string, meta?: CloudSyncMeta): Promise<boolean> {
  try {
    return await upsertCloudData(userId, data, meta);
  } catch (error) {
    console.error('[CloudSync] Failed to sync to cloud for user:', error);
    return false;
  }
}

export async function loadFromCloud(): Promise<CloudSyncRecord | null> {
  try {
    const authed = await getAuthedClient();
    if (!authed) return null;

    const { data, error } = await authed.client
      .from('axia_data')
      .select('data, updated_at')
      .eq('user_id', authed.userId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      data: data.data as CloudSyncData,
      updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
      meta: (data.data as CloudSyncPackage | undefined)?.meta || null,
    };
  } catch (error) {
    console.error('[CloudSync] Failed to load from cloud:', error);
    return null;
  }
}

async function upsertCloudData(userId: string, data: CloudSyncData, meta?: CloudSyncMeta): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) {
    console.log('[CloudSync] Missing Supabase config, skipping upsert');
    return false;
  }

  const client = createClient();
  const packageData: CloudSyncPackage = {
    meta: meta || nextMeta(),
    data,
  };

  const { error } = await client.from('axia_data').upsert({
    user_id: userId,
    data: packageData,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[CloudSync] Upsert error:', error);
    return false;
  }

  console.log('[CloudSync] Data synced to cloud successfully');
  return true;
}
