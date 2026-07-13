import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Account, Position, Snapshot, Trade, Transfer, TargetAllocation } from '@/types';

export interface CloudSyncData {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  targetAllocations: TargetAllocation[];
}

export async function getSupabaseConfig(): Promise<{ url: string; anonKey: string } | null> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      console.error('[CloudSync] Failed to fetch config:', response.status);
      return null;
    }
    const config = await response.json();
    if (!config.url || !config.anonKey) {
      console.error('[CloudSync] Invalid config received');
      return null;
    }
    return { url: config.url, anonKey: config.anonKey };
  } catch (error) {
    console.error('[CloudSync] Error fetching config:', error);
    return null;
  }
}

/**
 * Per-user authenticated Supabase client.
 *
 * Returns null if the user is not logged in — callers MUST treat this as a
 * no-op (no cloud sync happens for anonymous visitors).
 */
async function getAuthedClient(): Promise<{ client: SupabaseClient; userId: string } | null> {
  const config = await getSupabaseConfig();
  if (!config) return null;

  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user) return null;

  return { client, userId: data.session.user.id };
}

export async function syncToCloud(data: CloudSyncData): Promise<boolean> {
  try {
    const authed = await getAuthedClient();
    if (!authed) {
      console.log('[CloudSync] No active session, skipping sync');
      return false;
    }

    const { error } = await authed.client.from('axia_data').upsert({
      user_id: authed.userId,
      data,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[CloudSync] Sync error:', error);
      return false;
    }
    console.log('[CloudSync] Data synced to cloud successfully');
    return true;
  } catch (error) {
    console.error('[CloudSync] Failed to sync to cloud:', error);
    return false;
  }
}

export async function loadFromCloud(): Promise<CloudSyncData | null> {
  try {
    const authed = await getAuthedClient();
    if (!authed) {
      console.log('[CloudSync] No active session, skipping load');
      return null;
    }

    const { data, error } = await authed.client
      .from('axia_data')
      .select('data')
      .eq('user_id', authed.userId)
      .maybeSingle();

    if (error) {
      console.log('[CloudSync] Load error:', error);
      return null;
    }
    if (!data) {
      console.log('[CloudSync] No cloud data for this user');
      return null;
    }
    console.log('[CloudSync] Data loaded from cloud');
    return data.data as CloudSyncData;
  } catch (error) {
    console.error('[CloudSync] Failed to load from cloud:', error);
    return null;
  }
}
