/**
 * Exchange Rates API Route
 * Fetches bank forex sell rates from Sina Finance
 * Sina returns: field[0]=time, [1]=buy, [2]=sell, [3]=cash-buy, [4]=cash-sell, [5]=bank-conversion, [6-8]=PBOC-mid
 * We use field[2] (sell rate) — the rate banks sell foreign currency to you
 */

import { NextResponse } from 'next/server';
import { DEFAULT_EXCHANGE_RATES } from '@/config/exchangeRates';

// Sina forex codes: fx_s{currency code lower}cny = foreign currency → CNY sell rate
const SINA_CODES = [
  { code: 'HKD', sina: 'fx_shkdcny' },
  { code: 'USD', sina: 'fx_susdcny' },
  { code: 'EUR', sina: 'fx_seurcny' },
  { code: 'JPY', sina: 'fx_sjpycny' },
  { code: 'GBP', sina: 'fx_sgbpcny' },
] as const;

interface RateResult {
  code: string;
  rate: number;
  updateTime: string;
}

async function fetchSinaRates(): Promise<RateResult[]> {
  const sinaList = SINA_CODES.map(c => c.sina).join(',');
  try {
    const res = await fetch(
      `https://hq.sinajs.cn/list=${sinaList}`,
      {
        headers: {
          Referer: 'https://finance.sina.com.cn/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) throw new Error(`Sina HTTP ${res.status}`);

    const text = await res.text();
    const results: RateResult[] = [];

    // Parse: var hq_str_fx_shkdcny="02:56:32,6.7709000000,6.7994000000,...";
    const lines = text.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/hq_str_fx_s(\w+)cny="([^"]+)"/);
      if (!match) continue;

      const rawCode = match[1].toUpperCase(); // e.g. "HKDC" from "fx_shkdcny"
      const currencyMap: Record<string, string> = {
        HKD: 'HKD',
        USD: 'USD',
        EUR: 'EUR',
        JPY: 'JPY',
        GBP: 'GBP',
      };
      const code = currencyMap[rawCode];
      if (!code) continue;

      const fields = match[2].split(',');
      // field[0]=time, [1]=buy, [2]=sell(现汇卖出价), [3]=cash-buy, [4]=cash-sell
      const sellRate = parseFloat(fields[2]);
      if (!isNaN(sellRate) && sellRate > 0) {
        results.push({
          code,
          rate: sellRate,
          updateTime: fields[0] || new Date().toISOString(),
        });
      }
    }

    return results;
  } catch (error) {
    console.error('[rates] Sina fetch failed:', error);
    return [];
  }
}

export async function GET() {
  const rates = await fetchSinaRates();

  // Build rateMap: 1 unit foreign = X CNY
  const rateMap: Record<string, number> = {};
  for (const r of rates) {
    rateMap[r.code] = r.rate;
  }

  // Fallback to defaults for any missing currencies
  const allCurrencies = ['HKD', 'USD', 'EUR', 'JPY', 'GBP'] as const;
  for (const ccy of allCurrencies) {
    if (!rateMap[ccy]) {
      rateMap[ccy] = (DEFAULT_EXCHANGE_RATES as Record<string, number>)[ccy] ?? 1;
    }
  }

  return NextResponse.json({
    success: rates.length > 0,
    rates,
    rateMap,
    timestamp: new Date().toISOString(),
    source: 'sina_forex_sell',
  });
}
