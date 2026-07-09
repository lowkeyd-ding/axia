/**
 * Price API Route - Server-side proxy for stock prices
 * Supports A-shares, HK stocks, and US stocks via Sina Finance
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, jsonResponse } from '@/lib/apiValidation';

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

function parseUSStockResponse(symbol: string, text: string): PriceData | null {
  try {
    const match = text.match(/="([^"]+)"/);
    if (!match) return null;
    const parts = match[1].split(',');
    if (parts.length < 10) return null;

    const name = parts[0].trim().replace(/^["']|["']$/g, '');
    const price = parseFloat(parts[1]) || 0;
    const change = parseFloat(parts[2]) || 0;
    const changePercent = parseFloat(parts[3]) || 0;
    const prevClose = parts[4] ? parseFloat(parts[4]) : 0;
    const open = parseFloat(parts[5]) || 0;
    const high = parseFloat(parts[6]) || 0;
    const low = parseFloat(parts[7]) || 0;
    const volume = parseFloat(parts[9]) || 0;

    if (price === 0) return null;

    return { symbol, name, price, change, changePercent, prevClose, open, high, low, volume, timestamp: new Date().toISOString(), source: 'realtime', exchange: 'US' };
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
  // Try Yahoo Finance first
  const yahooSymbol = symbol.toUpperCase();
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;

  try {
    const yahooResponse = await fetch(yahooUrl, { signal: AbortSignal.timeout(5000) });
    if (yahooResponse.ok) {
      const yahooData = await yahooResponse.json();
      const result = yahooData?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];
        if (meta && quote) {
          const price = meta.regularMarketPrice || quote.close?.[0];
          const prevClose = meta.previousClose || quote.close?.[1];
          if (price) {
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
          }
        }
      }
    }
  } catch {}

  // Fallback to Sina Finance
  return fetchUSFromSina(symbol);
}

async function fetchUSFromSina(symbol: string): Promise<PriceData | null> {
  const upper = symbol.toUpperCase();
  const sinaSymbol = `gb_${upper.toLowerCase()}`;
  const url = `https://hq.sinajs.cn/list=${sinaSymbol}`;

  try {
    const response = await fetch(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buffer);

    return parseUSStockResponse(symbol, text);
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

  // Try fund API for fund symbols (5xxxxxx codes)
  if (/^5\d{5}$/.test(symbol.toUpperCase())) {
    const fundResult = await fetchFundFromEastMoney(symbol);
    if (fundResult) return fundResult;
  }

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

// Fetch REIT/fund price using East Money stock API (REITs trade like stocks, need /100)
async function fetchFundFromEastMoney(symbol: string): Promise<PriceData | null> {
  // REITs on Shanghai use secid prefix 1.xxxxxx, same as stocks
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=1.${symbol}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60`;

  try {
    const response = await fetch(url, {
      headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    const info = data?.data;
    if (!info || !info.f43) return null;

    // REITs trade like stocks - prices returned in "分" format, need /100 to get yuan
    const price = info.f43 / 100;
    const prevClose = info.f60 ? info.f60 / 100 : price;
    const high = info.f44 ? info.f44 / 100 : price;
    const low = info.f45 ? info.f45 / 100 : price;
    const open = info.f46 ? info.f46 / 100 : price;

    if (!price || price === 0) return null;

    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      name: info.f58 || symbol,
      price,
      change,
      changePercent,
      prevClose,
      open,
      high,
      low,
      volume: info.f47 || 0,
      timestamp: new Date().toISOString(),
      source: 'fund'
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
  // .OF format funds (open-ended fund)
  if (/\.OF$/i.test(upper)) return 'FUND_OF';
  // Fund symbols (5xxxxxx) - use FUND exchange for REITs
  if (/^5\d{5}$/.test(upper)) return 'FUND';
  if (/^[023]\d{5}$/.test(upper)) return 'SZ';
  if (/^[569]\d{5}$/.test(upper)) return 'SH';
  if (/^\d{5}$/.test(upper)) return 'HK';
  if (/^[A-Z]{1,5}$/.test(upper)) return 'US';
  // Handle currency pairs like HKDUSD, CNYUSD
  if (/^[A-Z]{6}$/.test(upper)) return 'FOREX';
  return 'UNKNOWN';
}

// 东方财富 API 返回的行情项
interface EastMoneyQuoteItem {
  f57?: string; // 代码
  f43?: number; // 当前价格
  [key: string]: unknown;
}

// Default exchange rates (fallback)
const DEFAULT_RATES: Record<string, number> = {
  HKD: 0.92,    // HKD to CNY (approximate)
  USD: 7.25,   // USD to CNY (approximate)
  EUR: 7.85,   // EUR to CNY (approximate)
  JPY: 0.048,  // JPY to CNY (approximate)
  GBP: 9.15,   // GBP to CNY (approximate)
};

// Fetch exchange rates from multiple sources
async function fetchExchangeRates(): Promise<Record<string, number>> {
  const rates = { ...DEFAULT_RATES };

  // Try East Money forex API (most reliable for CNY rates)
  try {
    // Fetch USD/CNY, HKD/CNY, EUR/CNY, JPY/CNY, GBP/CNY
    const symbols = ['USDCNY', 'HKDCNY', 'EURCNY', 'JPYCNY', 'GBPCNY'];
    const secids = ['106,USDCNH', '106,HKDCNH', '106,EURCNY', '106,JPYCNY', '106,GBPCNY'];

    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secids.join(',')}&fields=f43,f57,f58`;

    const response = await fetch(url, {
      headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      const items = (data?.data?.diff?.filter(Boolean) || []) as EastMoneyQuoteItem[];

      // USD/CNY (convert from USD/CNH)
      const usdItem = items.find((item) => item.f57 === 'USDCNH');
      if (usdItem && usdItem.f43) {
        // USDCNH / 100 = actual rate, but we need USDCNY
        // Approximate: USDCNY ≈ USDCNH * 1.0 (they're very close)
        rates['USD'] = usdItem.f43 / 100;
      }

      // HKD/CNY (convert from HKD/CNH)
      const hkdItem = items.find((item) => item.f57 === 'HKDCNH');
      if (hkdItem && hkdItem.f43) {
        // HKDCNH / 100 = actual rate
        rates['HKD'] = hkdItem.f43 / 100;
      }

      // EUR/CNY
      const eurItem = items.find((item) => item.f57 === 'EURCNY');
      if (eurItem && eurItem.f43) {
        rates['EUR'] = eurItem.f43 / 100;
      }

      // JPY/CNY (multiply by 100 to get actual rate)
      const jpyItem = items.find((item) => item.f57 === 'JPYCNY');
      if (jpyItem && jpyItem.f43) {
        rates['JPY'] = jpyItem.f43 / 10000; // JPY is quoted differently
      }

      // GBP/CNY
      const gbpItem = items.find((item) => item.f57 === 'GBPCNY');
      if (gbpItem && gbpItem.f43) {
        rates['GBP'] = gbpItem.f43 / 100;
      }
    }
  } catch {}

  return rates;
}

// Check if symbol is a fund
function isFundSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  // Fund symbols are 5xxxxxx on SH, also check our lookup table
  if (/^5\d{5}$/.test(upper)) return true;
  // .OF format funds (open-ended fund)
  if (/\.OF$/i.test(upper)) return true;
  return false;
}

// Fetch .OF format open-ended fund NAV from East Money
async function fetchOFFundNAV(symbol: string): Promise<PriceData | null> {
  // Remove .OF suffix if present
  const fundCode = symbol.replace(/\.OF$/i, '');

  // East Money fund NAV API
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;

  try {
    const response = await fetch(url, {
      headers: { 'Referer': 'https://fund.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;

    const text = await response.text();

    // Parse JSONP response: jsonpgz({"gsz": ...})
    const match = text.match(/jsonpgz\((.+)\)/);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    if (!data || !data.gsz) return null;

    const price = parseFloat(data.gsz);
    const prevClose = parseFloat(data.gzct || data.dwjz);
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    if (isNaN(price) || price === 0) return null;

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
      source: 'fund'
    };
  } catch {
    return null;
  }
}

async function fetchSymbol(symbol: string): Promise<PriceData | null> {
  const exchange = getExchange(symbol);

  // Handle .OF format funds specially
  if (exchange === 'FUND_OF') {
    return fetchOFFundNAV(symbol);
  }

  // Handle fund symbols (5xxxxxx REITs)
  if (exchange === 'FUND') {
    return fetchFundFromEastMoney(symbol);
  }

  if (exchange === 'SZ' || exchange === 'SH') return fetchFromSina(symbol);
  if (exchange === 'HK') return fetchFromSina(symbol);
  if (exchange === 'US') return parseUSResponse(symbol);
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return errorResponse('Missing symbols parameter');
  }

  // Validate symbol format: each symbol must be 1-20 alphanumeric characters
  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  // Validate each symbol format
  const validSymbolPattern = /^[A-Z0-9.\-]{1,20}$/;
  for (const symbol of symbols) {
    if (!validSymbolPattern.test(symbol)) {
      return errorResponse(`Invalid symbol format: ${symbol}`);
    }
  }

  if (symbols.length === 0) return jsonResponse({ prices: [] });
  if (symbols.length > 50) return errorResponse('Too many symbols (max 50)');

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

  return jsonResponse({ success: errors.length === 0, prices, errors: errors.length > 0 ? errors : undefined });
}
