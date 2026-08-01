import { NextRequest, NextResponse } from 'next/server';

interface FundEstimate {
  fundcode: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gztime: string;
}

interface HistoricalNavItem {
  FSRQ: string;
  DWJZ: string;
  JZZZL?: string;
}

interface NetWorthTrendItem {
  x: number;
  y: number;
  equityReturn?: number;
}

const MAX_SYMBOLS = 20;
const REQUEST_TIMEOUT_MS = 8_000;
const SYMBOL_PATTERN = /^\d{6}(?:\.OF)?$/i;

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

function isExchangeTradedFund(symbol: string) {
  return /^(?:5\d{5}|1(?:5|6|8)\d{4})$/.test(symbol);
}

async function fetchListedFund(symbol: string) {
  const marketId = symbol.startsWith('5') ? '1' : '0';
  const response = await fetchWithTimeout(
    `https://push2.eastmoney.com/api/qt/stock/get?secid=${marketId}.${symbol}&fields=f43,f44,f45,f46,f47,f58,f60`,
    { headers: { Referer: 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!response.ok) return null;

  const info = (await response.json())?.data;
  const price = Number(info?.f43) / 1000;
  const prevClose = Number(info?.f60) / 1000;
  if (!Number.isFinite(price) || price <= 0) return null;

  const base = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price;
  const change = price - base;
  return {
    symbol,
    name: info?.f58 || symbol,
    price,
    change,
    changePercent: base > 0 ? (change / base) * 100 : 0,
    prevClose: base,
    open: Number(info?.f46) / 1000 || price,
    high: Number(info?.f44) / 1000 || price,
    low: Number(info?.f45) / 1000 || price,
    volume: Number(info?.f47) || 0,
    timestamp: new Date().toISOString(),
    source: 'fund' as const,
  };
}

async function fetchConfirmedNav(symbol: string) {
  const response = await fetchWithTimeout(
    `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=2`,
    {
      headers: {
        Referer: 'https://fundf10.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );
  if (!response.ok) return null;

  const rows = (await response.json())?.Data?.LSJZList as HistoricalNavItem[] | undefined;
  const latest = rows?.[0];
  const price = Number(latest?.DWJZ);
  if (!latest || !Number.isFinite(price) || price <= 0) return null;

  const previous = Number(rows?.[1]?.DWJZ);
  const reportedPercent = Number(latest.JZZZL);
  const prevClose = Number.isFinite(previous) && previous > 0
    ? previous
    : Number.isFinite(reportedPercent) && reportedPercent !== -100
      ? price / (1 + reportedPercent / 100)
      : price;
  const change = price - prevClose;

  return {
    symbol,
    name: symbol,
    price,
    change,
    changePercent: prevClose > 0 ? (change / prevClose) * 100 : 0,
    prevClose,
    open: price,
    high: price,
    low: price,
    volume: 0,
    timestamp: `${latest.FSRQ}T15:00:00+08:00`,
    source: 'fund' as const,
  };
}



async function fetchOtcFund(symbol: string) {
  try {
    const response = await fetchWithTimeout(`https://fundgz.1234567.com.cn/js/${symbol}.js?rt=${Date.now()}`, {
      headers: { Referer: 'https://fund.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
    });
    if (response.ok) {
      const match = (await response.text()).match(/jsonpgz\((.+)\)/);
      if (match) {
        const data: FundEstimate = JSON.parse(match[1]);
        const price = Number(data.gsz);
        const prevClose = Number(data.dwjz);
        if (Number.isFinite(price) && price > 0 && Number.isFinite(prevClose) && prevClose > 0) {
          const change = price - prevClose;
          return {
            symbol,
            name: data.name || symbol,
            price,
            change,
            changePercent: (change / prevClose) * 100,
            prevClose,
            open: price,
            high: price,
            low: price,
            volume: 0,
            timestamp: data.gztime || data.jzrq,
            source: 'fund' as const,
          };
        }
      }
    }
  } catch {
    // Continue with confirmed NAV sources.
  }

  try {
    const confirmed = await fetchConfirmedNav(symbol);
    if (confirmed) return confirmed;
  } catch {
    // Continue with the public fund page data source.
  }

  return null;
}

export async function GET(request: NextRequest) {
  const symbolsParam = new URL(request.url).searchParams.get('symbols');
  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbols = [...new Set(
    symbolsParam.split(',').map((value) => value.trim().toUpperCase().replace(/\.OF$/, '')).filter(Boolean)
  )];
  if (symbols.length > MAX_SYMBOLS) {
    return NextResponse.json({ error: `单次最多查询 ${MAX_SYMBOLS} 个基金` }, { status: 400 });
  }
  if (symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    return NextResponse.json({ error: '包含无效的基金代码' }, { status: 400 });
  }

  const settled = await Promise.all(symbols.map(async (symbol) => {
    try {
      const price = isExchangeTradedFund(symbol)
        ? await fetchListedFund(symbol)
        : await fetchOtcFund(symbol);
      return price ? { price } : { error: `${symbol}: 未获取到基金净值` };
    } catch {
      return { error: `${symbol}: 基金净值服务暂时不可用` };
    }
  }));

  const prices = settled.flatMap((item) => item.price ? [item.price] : []);
  const errors = settled.flatMap((item) => item.error ? [item.error] : []);
  return NextResponse.json({
    success: prices.length > 0 && errors.length === 0,
    prices,
    errors: errors.length ? errors : undefined,
  });
}
