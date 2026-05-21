/**
 * Price API Route - Server-side proxy for stock prices
 * Supports A-shares, HK stocks, and US stocks via Sina Finance
 */

import { NextRequest, NextResponse } from 'next/server';

interface PriceData {
  symbol: string;
  name?: string;
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
  exchange?: string;
}

const MOCK_PRICES: Record<string, { price: number; change: number; name: string }> = {
  '000002': { price: 7.15, change: -0.08, name: '万科A' },
  '000001': { price: 11.23, change: 0.15, name: '平安银行' },
  '600519': { price: 1688.00, change: 12.50, name: '贵州茅台' },
  '00700': { price: 368.00, change: 5.20, name: '腾讯控股' },
  'AAPL': { price: 178.50, change: 1.23, name: 'Apple Inc.' },
};

function toSinaSymbol(symbol: string): { sinaSymbol: string; exchange: string } {
  const upper = symbol.toUpperCase();
  if (/^[023]\d{5}$/.test(upper)) return { sinaSymbol: `sz${upper}`, exchange: 'SZ' };
  if (/^[569]\d{5}$/.test(upper)) return { sinaSymbol: `sh${upper}`, exchange: 'SH' };
  if (/^\d{5}$/.test(upper)) return { sinaSymbol: `hk${upper}`, exchange: 'HK' };
  if (/^[A-Z]{1,5}$/.test(upper)) return { sinaSymbol: `us${upper.toLowerCase()}`, exchange: 'US' };
  return { sinaSymbol: upper, exchange: 'UNKNOWN' };
}

function parseAShareResponse(symbol: string, text: string): PriceData | null {
  try {
    const match = text.match(/="([^"]+)"/);
    if (!match) return null;
    const parts = match[1].split(',');
    if (parts.length < 35) return null;

    const name = parts[0].trim();
    const open = parseFloat(parts[1]) || 0;
    const prevClose = parseFloat(parts[2]) || 0;
    const price = parseFloat(parts[3]) || 0;
    const high = parseFloat(parts[4]) || 0;
    const low = parseFloat(parts[5]) || 0;
    const volume = parseFloat(parts[8]) || 0;
    const timestamp = parts[30] && parts[31] ? `${parts[30]} ${parts[31]}` : new Date().toISOString();

    if (price === 0) return null;

    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return { symbol, name, price, change, changePercent, prevClose, open, high, low, volume, timestamp, source: 'realtime' };
  } catch {
    return null;
  }
}

function parseHKResponse(symbol: string, text: string): PriceData | null {
  try {
    const match = text.match(/="([^"]+)"/);
    if (!match) return null;
    const parts = match[1].split(',');
    if (parts.length < 15) return null;

    const name = parts[1]?.trim() || parts[0]?.trim() || '';
    const prevClose = parseFloat(parts[2]) || 0;
    const open = parseFloat(parts[3]) || 0;
    const high = parseFloat(parts[4]) || 0;
    const low = parseFloat(parts[5]) || 0;
    const price = parseFloat(parts[6]) || 0;
    const change = parseFloat(parts[7]) || 0;
    const changePercent = parseFloat(parts[8]) || 0;
    const volume = parseFloat(parts[11]) || 0;
    const timestamp = parts[17] && parts[18] ? `${parts[17]} ${parts[18]}` : new Date().toISOString();

    if (price === 0) return null;

    return { symbol, name, price, change, changePercent, prevClose, open, high, low, volume, timestamp, source: 'realtime', exchange: 'HK' };
  } catch {
    return null;
  }
}

async function parseUSResponse(symbol: string): Promise<PriceData | null> {
  const yahooSymbol = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    if (!meta || !quote) return null;

    const price = meta.regularMarketPrice || quote.close?.[0];
    const prevClose = meta.previousClose || quote.close?.[1];
    if (!price) return null;

    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol, name: meta.shortName || meta.symbol, price, change, changePercent, prevClose,
      open: meta.regularMarketOpen || quote.open?.[0],
      high: meta.regularMarketDayHigh || quote.high?.[0],
      low: meta.regularMarketDayLow || quote.low?.[0],
      volume: meta.regularMarketVolume,
      timestamp: new Date().toISOString(),
      source: 'realtime', exchange: 'US'
    };
  } catch {
    return null;
  }
}

async function fetchFromSina(symbol: string): Promise<PriceData | null> {
  const { sinaSymbol, exchange } = toSinaSymbol(symbol);

  try {
    const url = `https://hq.sinajs.cn/list=${sinaSymbol}`;
    const response = await fetch(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('gbk');
      const text = decoder.decode(buffer);

      if (exchange === 'SZ' || exchange === 'SH') {
        const result = parseAShareResponse(symbol, text);
        if (result) return result;
      } else if (exchange === 'HK') {
        const result = parseHKResponse(symbol, text);
        if (result) return result;
      }
    }
  } catch {}

  if (exchange === 'SZ' || exchange === 'SH') return fetchFromEastMoney(symbol, exchange);
  if (exchange === 'HK') return fetchHKFromEastMoney(symbol);
  return null;
}

async function fetchFromEastMoney(symbol: string, exchange: string): Promise<PriceData | null> {
  const secid = exchange === 'SZ' ? `0.${symbol}` : `1.${symbol}`;
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f169,f170,f171`;

  try {
    const response = await fetch(url, {
      headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    const info = data?.data;
    if (!info || !info.f43) return null;

    const price = info.f43 / 100;
    const prevClose = info.f60 ? info.f60 / 100 : 0;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol, name: info.f58 || symbol, price, change, changePercent, prevClose,
      open: info.f46 / 100, high: info.f44 / 100, low: info.f45 / 100, volume: info.f47 / 100,
      timestamp: new Date().toISOString(), source: 'realtime'
    };
  } catch {
    return null;
  }
}

async function fetchHKFromEastMoney(symbol: string): Promise<PriceData | null> {
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=116.${symbol}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f169,f170,f171`;

  try {
    const response = await fetch(url, {
      headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    const info = data?.data;
    if (!info || !info.f43) return null;

    const price = info.f43 / 100;
    const prevClose = info.f60 ? info.f60 / 100 : 0;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol, name: info.f58 || symbol, price, change, changePercent, prevClose,
      open: info.f46 / 100, high: info.f44 / 100, low: info.f45 / 100, volume: info.f47 / 100,
      timestamp: new Date().toISOString(), source: 'realtime', exchange: 'HK'
    };
  } catch {
    return null;
  }
}

function getExchange(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (/^[023]\d{5}$/.test(upper)) return 'SZ';
  if (/^[569]\d{5}$/.test(upper)) return 'SH';
  if (/^\d{5}$/.test(upper)) return 'HK';
  if (/^[A-Z]{1,5}$/.test(upper)) return 'US';
  return 'UNKNOWN';
}

async function fetchSymbol(symbol: string): Promise<PriceData | null> {
  const exchange = getExchange(symbol);
  if (exchange === 'SZ' || exchange === 'SH' || exchange === 'HK') return fetchFromSina(symbol);
  if (exchange === 'US') return parseUSResponse(symbol);
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  if (symbols.length === 0) return NextResponse.json({ prices: [] });
  if (symbols.length > 50) return NextResponse.json({ error: 'Too many symbols (max 50)' }, { status: 400 });

  const prices: PriceData[] = [];
  const errors: string[] = [];

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await fetchSymbol(symbol);
        return { symbol, result };
      } catch {
        return { symbol, result: null };
      }
    })
  );

  for (const { symbol, result } of results) {
    if (result) {
      prices.push(result);
    } else {
      const mock = MOCK_PRICES[symbol];
      if (mock) {
        prices.push({
          symbol, name: mock.name, price: mock.price, change: mock.change,
          changePercent: (mock.change / (mock.price - mock.change)) * 100,
          prevClose: mock.price - mock.change, open: mock.price, high: mock.price, low: mock.price,
          volume: 0, timestamp: new Date().toISOString(), source: 'mock', exchange: getExchange(symbol)
        });
      } else {
        errors.push(`无法获取 ${symbol} (${getExchange(symbol)})`);
      }
    }
  }

  return NextResponse.json({ success: errors.length === 0, prices, errors: errors.length > 0 ? errors : undefined });
}
