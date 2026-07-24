import { NextRequest, NextResponse } from 'next/server';

/**
 * Price API route - proxies fund price requests to avoid CORS issues.
 * 基金用天天基金接口(需服务端代理)
 */

interface FundData {
  fundcode: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
}

interface HistoricalNavItem {
  FSRQ: string;
  DWJZ: string;
  JZZZL?: string;
}

type PriceResult = { symbol: string; error: string } | {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
  source: string;
};

type FundResult = PriceResult | { symbol: string; error: string };

const MAX_SYMBOLS = 20;
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const cache = new Map<string, { expiresAt: number; result: FundResult }>();
const SYMBOL_PATTERN = /^(?:\d{5,6}|\d{6}\.OF|[A-Z]{1,5})$/;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function cached(symbol: string, loader: () => Promise<FundResult>): Promise<FundResult> {
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > Date.now()) return hit.result;
  const result = await loader();
  if (!('error' in result)) cache.set(symbol, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function getExchange(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (/\.OF$/i.test(upper)) return 'FUND_OF';
  // Exchange-traded funds: 5xxxxx (SH), 15xxxx/16xxxx/18xxxx (SZ).
  // Do not classify every 1xxxxx code as listed: e.g. 110022 is an OTC fund.
  if (/^(?:5\d{5}|1(?:5|6|8)\d{4})$/.test(upper)) return 'FUND';
  if (/^[023]\d{5}$/.test(upper)) return 'SZ';
  if (/^[569]\d{5}$/.test(upper)) return 'SH';
  if (/^\d{5}$/.test(upper)) return 'HK';
  if (/^[A-Z]{1,5}$/.test(upper)) return 'US';
  return 'UNKNOWN';
}

async function fetchLatestConfirmedNAV(symbol: string): Promise<FundResult> {
  const fundCode = symbol.replace(/\.OF$/i, '');
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=2`;
  const response = await fetchWithTimeout(url, {
    headers: {
      Referer: 'https://fundf10.eastmoney.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });
  if (!response.ok) return { symbol, error: `HTTP ${response.status}` };

  const body = await response.json();
  const rows = body?.Data?.LSJZList as HistoricalNavItem[] | undefined;
  const latest = rows?.[0];
  if (!latest) return { symbol, error: '未获取到最新净值' };

  const price = Number(latest.DWJZ);
  const previous = rows?.[1] ? Number(rows[1].DWJZ) : NaN;
  if (!Number.isFinite(price) || price <= 0) return { symbol, error: '最新净值无效' };

  const reportedPercent = Number(latest.JZZZL);
  const prevClose = Number.isFinite(previous) && previous > 0
    ? previous
    : Number.isFinite(reportedPercent) && reportedPercent !== -100
      ? price / (1 + reportedPercent / 100)
      : price;
  const change = price - prevClose;

  return {
    symbol: symbol.toUpperCase(),
    name: fundCode,
    price,
    change,
    changePercent: prevClose > 0 ? (change / prevClose) * 100 : 0,
    prevClose,
    open: price,
    high: price,
    low: price,
    volume: 0,
    timestamp: `${latest.FSRQ}T15:00:00+08:00`,
    source: 'fund',
  };
}

async function fetchOFFundNAV(symbol: string): Promise<FundResult> {
  const fundCode = symbol.replace(/\.OF$/i, '');
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://fund.eastmoney.com',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const text = await response.text();
      const match = text.match(/jsonpgz\((.+)\)/);
      if (match) {
        const data: FundData = JSON.parse(match[1]);
        const price = Number(data.gsz);
        const prevClose = Number(data.dwjz);
        if (Number.isFinite(price) && price > 0 && Number.isFinite(prevClose) && prevClose > 0) {
          const change = price - prevClose;
          return {
            symbol: symbol.toUpperCase(),
            name: data.name || fundCode,
            price,
            change,
            changePercent: (change / prevClose) * 100,
            prevClose,
            open: price,
            high: price,
            low: price,
            volume: 0,
            timestamp: data.gztime || data.jzrq,
            source: 'fund',
          };
        }
      }
    }
  } catch {
    // The intraday estimate endpoint is optional; confirmed NAV remains authoritative.
  }

  try {
    return await fetchLatestConfirmedNAV(symbol);
  } catch {
    return { symbol, error: '基金净值服务暂时不可用，请稍后重试' };
  }
}

async function fetchFundNAV(symbol: string): Promise<FundResult> {
  // Determine market: SH funds start with 5, SZ funds start with 1 or 15
  const upper = symbol.toUpperCase();
  const marketId = /^5\d{5}$/.test(upper) ? '1' : '0';
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${marketId}.${symbol}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://quote.eastmoney.com',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return { symbol, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const info = data?.data;
    if (!info || !info.f43) {
      return { symbol, error: 'No data from EastMoney' };
    }

    const price = info.f43 / 1000;
    const prevClose = info.f60 ? info.f60 / 1000 : price;

    if (!price || price === 0) {
      return { symbol, error: 'Invalid price' };
    }

    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      name: info.f58 || symbol,
      price,
      change,
      changePercent,
      prevClose,
      open: price,
      high: price,
      low: price,
      volume: info.f47 || 0,
      timestamp: new Date().toISOString(),
      source: 'fund',
    };
  } catch (err) {
    return { symbol, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbolList = [...new Set(symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (symbolList.length > MAX_SYMBOLS) {
    return NextResponse.json({ error: `单次最多查询 ${MAX_SYMBOLS} 个标的` }, { status: 400 });
  }
  if (symbolList.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    return NextResponse.json({ error: '包含无效的标的代码' }, { status: 400 });
  }

  const results = await Promise.all(
    symbolList.map(async (symbol) => cached(symbol, async () => {
      const exchange = getExchange(symbol);
      if (exchange === 'FUND_OF') return fetchOFFundNAV(symbol);
      if (exchange === 'FUND') return fetchFundNAV(symbol);
      return { symbol, error: '暂不支持该标的类型' };
    }))
  );

  const prices = results.filter((r): r is PriceResult => !('error' in r));
  const errors = results.filter((r): r is { symbol: string; error: string } => 'error' in r)
    .map((r) => `${r.symbol}: ${r.error}`);

  return NextResponse.json({
    success: errors.length === 0,
    prices,
    errors: errors.length > 0 ? errors : undefined,
  });
}
