/**
 * Shenzhen Stock Exchange HK Connect settlement-rate reader.
 * The exchange page publishes the latest settlement conversion ratios.
 */

import { createClient } from '@supabase/supabase-js';
import type { HkexSettlementRates } from '@/lib/fx';

const SZSE_RATE_URL = 'https://www.szse.cn/szhk/hkbussiness/exchangerate/index.html';
const FALLBACK_RATE: HkexSettlementRates = {
  date: '2026-07-31',
  bid: 0.86117,
  ask: 0.86123,
};

let cachedRate: { rate: HkexSettlementRates; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

function previousTradingDate(date = new Date()): string {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 1 ? 3 : day === 0 ? 2 : day === 6 ? 1 : 1));
  return result.toISOString().slice(0, 10);
}

function parseDate(value: string): string | null {
  const match = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function parseSzseRatePage(html: string, targetDate: string): HkexSettlementRates | null {
  const rowPattern = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowPattern) || [];
  for (const row of rows) {
    const text = row.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const date = parseDate(text);
    if (date !== targetDate) continue;
    const values = text.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    const rates = values.filter((value) => value > 0 && value < 2);
    if (rates.length >= 2) {
      return { date, bid: rates[0], ask: rates[1] };
    }
  }
  return null;
}

async function fetchSzseRate(targetDate: string): Promise<HkexSettlementRates | null> {
  try {
    const response = await fetch(SZSE_RATE_URL, { headers: { Accept: 'text/html' }, cache: 'no-store' });
    if (!response.ok) return null;
    return parseSzseRatePage(await response.text(), targetDate);
  } catch (error) {
    console.error('[hkexRateClient] SZSE fetch error:', error);
    return null;
  }
}

export async function getHkexSettlementRate(): Promise<{ rate: HkexSettlementRates; source: string }> {
  const now = Date.now();
  if (cachedRate && now - cachedRate.timestamp < CACHE_DURATION) {
    return { rate: cachedRate.rate, source: 'cache' };
  }

  const targetDate = previousTradingDate();
  const szseRate = await fetchSzseRate(targetDate);
  if (szseRate) {
    cachedRate = { rate: szseRate, timestamp: now };
    return { rate: szseRate, source: 'szse' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    try {
      const supabase = createClient(url, anonKey);
      const { data } = await supabase.from('hkex_rates').select('date, bid, ask').lte('date', targetDate).order('date', { ascending: false }).limit(1).single();
      if (data) {
        const rate = { date: data.date, bid: data.bid, ask: data.ask };
        cachedRate = { rate, timestamp: now };
        return { rate, source: 'supabase' };
      }
    } catch (error) {
      console.error('[hkexRateClient] Supabase read error:', error);
    }
  }

  return { rate: FALLBACK_RATE, source: 'default' };
}
