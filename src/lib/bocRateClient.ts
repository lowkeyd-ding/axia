export interface BOCHkdSellRate {
  date: string;
  rate: number;
  source: 'boc';
}

const CACHE_DURATION = 5 * 60 * 1000;
let cachedRate: { value: BOCHkdSellRate; timestamp: number } | null = null;

function parseBocHtml(html: string): BOCHkdSellRate | null {
  const rowMatch = html.match(/港币[\s\S]*?现汇卖出价[\s\S]*?(\d+\.\d+|\d+)/);
  const dateMatch = html.match(/发布日期\s*<[^>]*>\s*([0-9]{4}\/\d{2}\/\d{2})/);
  if (!rowMatch) return null;
  const rawRate = Number(rowMatch[1]);
  if (!Number.isFinite(rawRate) || rawRate <= 0) return null;
  return {
    date: dateMatch?.[1]?.replace(/\//g, '-') || new Date().toISOString().slice(0, 10),
    rate: rawRate / 100,
    source: 'boc',
  };
}

export async function fetchBocHkdSellRate(): Promise<BOCHkdSellRate | null> {
  const now = Date.now();
  if (cachedRate && (now - cachedRate.timestamp) < CACHE_DURATION) {
    return cachedRate.value;
  }

  try {
    const response = await fetch('https://www.boc.cn/sourcedb/whpj/', {
      headers: {
        Referer: 'https://www.boc.cn/',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const html = await response.text();
    const rate = parseBocHtml(html);
    if (rate) {
      cachedRate = { value: rate, timestamp: now };
      return rate;
    }
  } catch {
    return null;
  }

  return null;
}
