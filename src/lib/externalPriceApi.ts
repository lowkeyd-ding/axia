/**
 * Client-side stock price fetchers.
 * Ported from src/app/api/price/route.ts so static export can drop /api/price.
 */

export interface PriceData {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  timestamp: string;
  source: 'realtime' | 'fund' | 'manual';
  exchange?: string;
  dataTier?: 'realtime' | 'estimate' | 'confirmed' | 'cached' | 'stale';
  sourceLabel?: string;
}

const MOCK_PRICES: Record<string, { price: number; change: number; name: string }> = {
  '000002': { price: 7.15, change: -0.08, name: '万科A' },
  '000001': { price: 11.23, change: 0.15, name: '平安银行' },
  '600519': { price: 1688.00, change: 12.50, name: '贵州茅台' },
  '000036': { price: 35.82, change: 0.28, name: '招商银行' },
  '601318': { price: 45.67, change: 0.78, name: '中国平安' },
  '000858': { price: 142.50, change: 2.30, name: '五粮液' },
  '002594': { price: 245.67, change: 3.45, name: '比亚迪' },
  '300750': { price: 198.76, change: -2.34, name: '宁德时代' },
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
              timestamp: new Date().toISOString(), source: 'realtime', exchange: 'US'
            };
          }
        }
      }
    }
  } catch {}

  return fetchUSFromSina(symbol);
}

async function fetchUSFromSina(symbol: string): Promise<PriceData | null> {
  const upper = symbol.toUpperCase();
  const sinaSymbol = `gb_${upper.toLowerCase()}`;
  const url = `https://hq.sinajs.cn/list=${sinaSymbol}`;

  try {
    const response = await fetch(url, {
      headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
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
      headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
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

  if (/^5\d{5}$/.test(symbol.toUpperCase())) {
    return fetchFundFromEastMoney(symbol);
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
      headers: { Referer: 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
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

async function fetchFundFromEastMoney(symbol: string): Promise<PriceData | null> {
  // Determine market: SH funds start with 5, SZ funds start with 1 or 15
  const upper = symbol.toUpperCase();
  const marketId = /^5\d{5}$/.test(upper) ? '1' : '0';
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${marketId}.${symbol}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60`;

  try {
    const response = await fetch(url, {
      headers: { Referer: 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    const info = data?.data;
    if (!info || !info.f43) return null;

    const price = info.f43 / 1000;
    const prevClose = info.f60 ? info.f60 / 1000 : price;
    const high = info.f44 ? info.f44 / 1000 : price;
    const low = info.f45 ? info.f45 / 1000 : price;
    const open = info.f46 ? info.f46 / 1000 : price;

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
      headers: { Referer: 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    const info = data?.data;
    if (!info || !info.f43) return null;

    const price = info.f43 / 1000;
    const prevClose = info.f60 ? info.f60 / 1000 : 0;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol, name: info.f58 || symbol, price, change, changePercent, prevClose,
      open: info.f46 / 1000, high: info.f44 / 1000, low: info.f45 / 1000, volume: info.f47,
      timestamp: new Date().toISOString(), source: 'realtime', exchange: 'HK'
    };
  } catch {
    return null;
  }
}

function getExchange(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (/\.OF$/i.test(upper)) return 'FUND_OF';
  // Exchange-traded funds: 5xxxxx (SH), 15xxxx/16xxxx/18xxxx (SZ).
  if (/^(?:5\d{5}|1(?:5|6|8)\d{4})$/.test(upper)) return 'FUND';
  if (/^[023]\d{5}$/.test(upper)) return 'SZ';
  if (/^[569]\d{5}$/.test(upper)) return 'SH';
  if (/^\d{5}$/.test(upper)) return 'HK';
  if (/^[A-Z]{1,5}$/.test(upper)) return 'US';
  if (/^[A-Z]{6}$/.test(upper)) return 'FOREX';
  return 'UNKNOWN';
}

export async function fetchSymbol(symbol: string): Promise<PriceData | null> {
  const exchange = getExchange(symbol);

  if (exchange === 'FUND_OF') return fetchOFFundNAV(symbol);
  if (exchange === 'FUND') return fetchFundNAV(symbol);
  if (exchange === 'SZ' || exchange === 'SH' || exchange === 'HK') return fetchFromSina(symbol);
  if (exchange === 'US') return parseUSResponse(symbol);
  return null;
}

async function fetchOFFundNAV(symbol: string): Promise<PriceData | null> {
  try {
    const response = await fetch(`/api/fund-price?symbols=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return fetchFundFromEastMoney(symbol);
    }

    const data = await response.json();
    if (data.prices && data.prices.length > 0) {
      return data.prices[0];
    }
  } catch {}

  return fetchFundFromEastMoney(symbol);
}

async function fetchFundNAV(symbol: string): Promise<PriceData | null> {
  try {
    const response = await fetch(`/api/fund-price?symbols=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return fetchFundFromEastMoney(symbol);
    }

    const data = await response.json();
    if (data.prices && data.prices.length > 0) {
      return data.prices[0];
    }
  } catch {}

  return fetchFundFromEastMoney(symbol);
}
