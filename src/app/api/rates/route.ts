/**
 * Exchange Rates API Route
 * Fetches real-time exchange rates from East Money
 * API: https://push2.eastmoney.com/api/qt/ulist.np/get
 */

import { NextResponse } from 'next/server';

// Default exchange rates (fallback - more accurate values)
const DEFAULT_RATES: Record<string, number> = {
  HKD: 0.8637,  // HKD to CNY (user confirmed: ~0.8637)
  USD: 7.24,     // USD to CNY
  EUR: 7.85,     // EUR to CNY
  JPY: 0.048,    // JPY to CNY
  GBP: 9.15,     // GBP to CNY
};

interface ExchangeRate {
  code: string;
  name: string;
  rate: number;  // Rate to CNY
  updateTime: string;
}

/**
 * Fetch exchange rates from East Money
 * Uses push2.eastmoney.com API for forex data
 * 
 * Note: East Money forex API returns rates in format where:
 * - f43 = current price (外汇买入价/卖出价中间价)
 * - The actual rate may need scaling
 */
async function fetchExchangeRates(): Promise<ExchangeRate[]> {
  const rates: ExchangeRate[] = [];

  // East Money forex secids - 106 = forex market
  const forexPairs = [
    { code: 'USDCNY', name: '美元/人民币', secid: '106,USDCNY' },
    { code: 'HKDCNY', name: '港币/人民币', secid: '106,HKDCNY' },
    { code: 'EURCNY', name: '欧元/人民币', secid: '106,EURCNY' },
    { code: 'JPYCNY', name: '日元/人民币', secid: '106,JPYCNY' },
    { code: 'GBPCNY', name: '英镑/人民币', secid: '106,GBPCNY' },
  ];

  try {
    // Build secid list: market,code pairs
    const secids = forexPairs.map(p => p.secid).join(',');
    // Fields: f43=最新价, f57=代码, f58=名称, f60=昨收, f107=涨跌额, f169=涨跌幅
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&secids=${secids}&fields=f2,f3,f4,f6,f7,f8,f12,f14`;

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      console.error('Exchange rate API returned:', response.status);
    } else {
      const data = await response.json();
      
      // Parse the response - East Money ulist API format
      if (data?.data?.diff && Array.isArray(data.data.diff)) {
        for (const item of data.data.diff) {
          if (!item || !item.f12) continue;
          
          const code = item.f12; // e.g., "USDCNY"
          const price = item.f2; // f2 = 最新价 in ulist API
          
          // Find the pair info
          const pair = forexPairs.find(p => p.code === code);
          if (!pair || !price || price === 0) continue;

          // f2 is the actual exchange rate (no division needed)
          // For HKD/CNY around 0.86, this should be the direct value
          rates.push({
            code,
            name: pair.name,
            rate: price,
            updateTime: new Date().toISOString(),
          });
        }
      }
      
      // Fallback: try data array format
      else if (data?.data && Array.isArray(data.data)) {
        for (const item of data.data) {
          if (!item || !item.f12) continue;
          const code = item.f12;
          const price = item.f2;
          const pair = forexPairs.find(p => p.code === code);
          if (pair && price && price > 0) {
            rates.push({
              code,
              name: pair.name,
              rate: price,
              updateTime: new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates from East Money:', error);
  }

  // If we couldn't fetch any rates, return defaults
  if (rates.length === 0) {
    console.warn('Using default exchange rates');
    return Object.entries(DEFAULT_RATES).map(([code, rate]) => ({
      code: code + 'CNY',
      name: getCurrencyName(code),
      rate,
      updateTime: new Date().toISOString(),
    }));
  }

  return rates;
}

function getCurrencyName(code: string): string {
  const names: Record<string, string> = {
    HKD: '港币/人民币',
    USD: '美元/人民币',
    EUR: '欧元/人民币',
    JPY: '日元/人民币',
    GBP: '英镑/人民币',
  };
  return names[code] || code;
}

export async function GET() {
  const rates = await fetchExchangeRates();

  // Convert to a simple key-value map for easy consumption
  // Key: currency code (HKD, USD, etc.), Value: 1 unit = X CNY
  const rateMap: Record<string, number> = {};
  for (const r of rates) {
    // Extract currency code (e.g., "USD" from "USDCNY")
    const currency = r.code.replace('CNY', '');
    rateMap[currency] = r.rate;
  }

  return NextResponse.json({
    success: rates.length > 0,
    rates,
    rateMap,
    timestamp: new Date().toISOString(),
  });
}
