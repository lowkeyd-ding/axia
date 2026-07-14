/**
 * Client-side HKEX settlement rate reader.
 * Reads the latest rate directly from Supabase for static export compatibility.
 */

import { createClient } from '@supabase/supabase-js';
import { HkexSettlementRates } from '@/lib/fx';

let cachedRate: { rate: HkexSettlementRates; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

export async function getHkexSettlementRate(): Promise<{ rate: HkexSettlementRates; source: string }> {
  const now = Date.now();
  if (cachedRate && (now - cachedRate.timestamp) < CACHE_DURATION) {
    return { rate: cachedRate.rate, source: 'cache' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      rate: { date: '', bid: 0.8649, ask: 0.8649 },
      source: 'default',
    };
  }

  try {
    const supabase = createClient(url, anonKey);
    const { data, error } = await supabase
      .from('hkex_rates')
      .select('date, bid, ask')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[hkexRateClient] Supabase read error:', error);
    }

    if (data) {
      const rate: HkexSettlementRates = { date: data.date, bid: data.bid, ask: data.ask };
      cachedRate = { rate, timestamp: now };
      return { rate, source: 'supabase' };
    }
  } catch (err) {
    console.error('[hkexRateClient] Fetch error:', err);
  }

  const defaultRate: HkexSettlementRates = { date: '', bid: 0.8649, ask: 0.8649 };
  return { rate: defaultRate, source: 'default' };
}
