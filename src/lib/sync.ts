import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase 客户端缓存
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(url: string, anonKey: string) {
  if (!supabaseClient) {
    supabaseClient = createClient(url, anonKey);
  }
  return supabaseClient;
}

const DATA_KEY = 'axia_data';

// 同步数据到云端
export async function syncToCloud(
  data: {
    accounts: any[];
    positions: any[];
    snapshots: any[];
    trades: any[];
    transfers: any[];
    targetAllocations: any[];
  },
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

// 从云端加载数据
export async function loadFromCloud(
  url: string,
  anonKey: string
): Promise<{
  accounts: any[];
  positions: any[];
  snapshots: any[];
  trades: any[];
  transfers: any[];
  targetAllocations: any[];
} | null> {
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
    return data.data;
  } catch (error) {
    console.error('Failed to load from cloud:', error);
    return null;
  }
}
