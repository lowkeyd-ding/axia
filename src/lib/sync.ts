import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Account, Position, Snapshot, Trade, Transfer, TargetAllocation } from '@/types';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(url: string, anonKey: string) {
  if (!supabaseClient) {
    supabaseClient = createClient(url, anonKey);
  }
  return supabaseClient;
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

const DATA_KEY = 'axia_data';

export interface CloudSyncData {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  targetAllocations: TargetAllocation[];
}

export async function syncToCloud(
  data: CloudSyncData,
  url: string,
  anonKey: string
): Promise<boolean> {
  try {
    const client = getSupabaseClient(url, anonKey);
    const record = {
      id: DATA_KEY,
      data: data,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('axia_data').upsert(record);

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

export async function loadFromCloud(
  url: string,
  anonKey: string
): Promise<CloudSyncData | null> {
  try {
    const client = getSupabaseClient(url, anonKey);
    const { data, error } = await client
      .from('axia_data')
      .select('data')
      .eq('id', DATA_KEY)
      .single();

    if (error || !data) {
      console.log('[CloudSync] No data in cloud or error:', error);
      return null;
    }
    console.log('[CloudSync] Data loaded from cloud:', data.data);
    return data.data as CloudSyncData;
  } catch (error) {
    console.error('Failed to load from cloud:', error);
    return null;
  }
}
