/**
 * Client-side Sina Finance forex API.
 * Returns forex sell rates: 1 unit foreign currency = X CNY.
 */

const SINA_CODES = [
  { code: 'HKD', sina: 'fx_shkdcny' },
  { code: 'USD', sina: 'fx_susdcny' },
  { code: 'EUR', sina: 'fx_seurcny' },
  { code: 'JPY', sina: 'fx_sjpycny' },
  { code: 'GBP', sina: 'fx_sgbpcny' },
] as const;

export interface RateResult {
  code: string;
  rate: number;
  updateTime: string;
}

export async function fetchSinaForexRates(): Promise<RateResult[]> {
  const sinaList = SINA_CODES.map(c => c.sina).join(',');
  try {
    const res = await fetch(`https://hq.sinajs.cn/list=${sinaList}`, {
      headers: {
        Referer: 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Sina HTTP ${res.status}`);

    const text = await res.text();
    const results: RateResult[] = [];
    const lines = text.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/hq_str_fx_s(\w+)cny="([^"]+)"/);
      if (!match) continue;

      const rawCode = match[1].toUpperCase();
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
    console.error('[forexApi] Sina fetch failed:', error);
    return [];
  }
}
