import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface EastmoneyKlineResponse {
  rc: number;
  data?: {
    code: string;
    name: string;
    klines?: string[];
  };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        longName?: string;
        shortName?: string;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

interface HistoricalPoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePercent: number;
}

interface HistoryResult {
  symbol: string;
  name?: string;
  currency?: string;
  points: HistoricalPoint[];
  error?: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inferMarket(symbol: string): 'cn' | 'hk' | 'us' | null {
  const upper = symbol.toUpperCase();
  if (/^\d{6}$/.test(upper)) return 'cn';
  if (/^\d{4,5}(?:\.HK)?$/.test(upper)) return 'hk';
  if (/^[A-Z][A-Z0-9.-]*$/.test(upper)) return 'us';
  return null;
}

function normalizeHkTicker(symbol: string): string {
  const digits = symbol.toUpperCase().replace(/\.HK$/, '');
  return `${String(Number(digits)).padStart(4, '0')}.HK`;
}

async function fetchEastmoneyHistory(symbol: string, start: string, end: string): Promise<HistoryResult> {
  const secid = symbol.startsWith('6') || symbol.startsWith('9') ? `1.${symbol}` : `0.${symbol}`;
  const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
  url.searchParams.set('secid', secid);
  url.searchParams.set('klt', '101');
  url.searchParams.set('fqt', '1');
  url.searchParams.set('beg', start.replace(/-/g, ''));
  url.searchParams.set('end', end.replace(/-/g, ''));
  url.searchParams.set('lmt', '5000');
  url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6');
  url.searchParams.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58');

  const response = await fetch(url.toString(), {
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { symbol, points: [], error: `HTTP ${response.status}` };

  const body = (await response.json()) as EastmoneyKlineResponse;
  const rows = body.data?.klines || [];
  const points = rows
    .map((row) => row.split(','))
    .filter((row) => row.length >= 8)
    .map((row) => {
      const [date, open, close, high, low, volume, amount, changePercent] = row;
      return {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
        changePercent: Number(changePercent),
      } satisfies HistoricalPoint;
    })
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && point.date >= start && point.date <= end);

  return {
    symbol: symbol.toUpperCase(),
    name: body.data?.name,
    currency: 'CNY',
    points,
  };
}

async function fetchYahooHistory(symbol: string, start: string, end: string): Promise<HistoryResult> {
  const market = inferMarket(symbol);
  if (market === null || market === 'cn') {
    return { symbol, points: [], error: 'not yahoo market' };
  }
  const ticker = market === 'hk' ? normalizeHkTicker(symbol) : symbol.toUpperCase();
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('includeAdjustedClose', 'true');
  url.searchParams.set('period1', `${Math.floor(new Date(`${start}T00:00:00.000Z`).getTime() / 1000)}`);
  url.searchParams.set('period2', `${Math.floor(new Date(`${addDays(end, 1)}T00:00:00.000Z`).getTime() / 1000)}`);
  url.searchParams.set('events', 'div,splits');

  const response = await fetch(url.toString(), {
    headers: {
      Referer: 'https://finance.yahoo.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { symbol, points: [], error: `HTTP ${response.status}` };

  const body = (await response.json()) as YahooChartResponse;
  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote || timestamps.length === 0) {
    return { symbol, points: [], error: body.chart?.error?.description || 'No data from Yahoo' };
  }

  const currency = result.meta?.currency || (market === 'hk' ? 'HKD' : 'USD');
  const name = result.meta?.longName || result.meta?.shortName || symbol.toUpperCase();
  const points: HistoricalPoint[] = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: Number(quote.open?.[index] ?? NaN),
      close: Number(quote.close?.[index] ?? NaN),
      high: Number(quote.high?.[index] ?? NaN),
      low: Number(quote.low?.[index] ?? NaN),
      volume: Number(quote.volume?.[index] ?? 0),
      amount: 0,
      changePercent: 0,
    }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && point.date >= start && point.date <= end)
    .map((point) => ({
      ...point,
      changePercent: point.open > 0 ? ((point.close - point.open) / point.open) * 100 : 0,
    }));

  return { symbol: symbol.toUpperCase(), name, currency, points };
}

async function fetchHistory(symbol: string, start: string, end: string): Promise<HistoryResult> {
  const market = inferMarket(symbol);
  if (market === 'cn') return fetchEastmoneyHistory(symbol.toUpperCase(), start, end);
  if (market === 'hk' || market === 'us') return fetchYahooHistory(symbol.toUpperCase(), start, end);
  return { symbol, points: [], error: '不支持的标的类型' };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get('symbols') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';

  if (symbols.length === 0 || !start || !end) {
    return NextResponse.json({ error: 'Missing symbols/start/end parameters' }, { status: 400 });
  }

  const results = await Promise.all(symbols.map((symbol) => fetchHistory(symbol, start, end)));
  return NextResponse.json({ success: true, results });
}
