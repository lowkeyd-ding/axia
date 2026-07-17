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
  gzct?: string;
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

function getExchange(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (/\.OF$/i.test(upper)) return 'FUND_OF';
  // ETF funds: 5xxxxx (SH), 1xxxxx (SZ like 159919, 159915), 15xxxx (SZ)
  if (/^(5|1|15)\d{5}$/.test(upper)) return 'FUND';
  if (/^[023]\d{5}$/.test(upper)) return 'SZ';
  if (/^[569]\d{5}$/.test(upper)) return 'SH';
  if (/^\d{5}$/.test(upper)) return 'HK';
  if (/^[A-Z]{1,5}$/.test(upper)) return 'US';
  return 'UNKNOWN';
}

async function fetchOFFundNAV(symbol: string): Promise<FundResult> {
  const fundCode = symbol.replace(/\.OF$/i, '');
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Referer: 'https://fund.eastmoney.com',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return { symbol, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    const match = text.match(/jsonpgz\((.+)\)/);

    if (!match) {
      return { symbol, error: 'Invalid response format' };
    }

    const data: FundData = JSON.parse(match[1]);
    const price = parseFloat(data.gsz);
    const prevClose = parseFloat(data.gzct || data.dwjz);

    if (isNaN(price) || price === 0) {
      return { symbol, error: 'Invalid price data' };
    }

    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: symbol.toUpperCase(),
      name: data.name || fundCode,
      price,
      change,
      changePercent,
      prevClose,
      open: price,
      high: price,
      low: price,
      volume: 0,
      timestamp: data.gztime || new Date().toISOString(),
      source: 'fund',
    };
  } catch (err) {
    return { symbol, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function fetchFundNAV(symbol: string): Promise<FundResult> {
  // Determine market: SH funds start with 5, SZ funds start with 1 or 15
  const upper = symbol.toUpperCase();
  const marketId = /^5\d{5}$/.test(upper) ? '1' : '0';
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${marketId}.${symbol}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60`;

  try {
    const response = await fetch(url, {
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

  const symbolList = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  const results = await Promise.all(
    symbolList.map(async (symbol) => {
      const exchange = getExchange(symbol);

      if (exchange === 'FUND_OF') {
        return fetchOFFundNAV(symbol);
      }
      if (exchange === 'FUND') {
        return fetchFundNAV(symbol);
      }

      return { symbol, error: 'Unsupported symbol type' };
    })
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
