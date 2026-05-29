/**
 * Exchange Rates API Route
 * Fetches real-time exchange rates from East Money
 */

import { NextResponse } from 'next/server';

// Default exchange rates (fallback)
const DEFAULT_RATES: Record<string, number> = {
  HKD: 0.92,    // HKD to CNY (approximate)
  USD: 7.25,    // USD to CNY (approximate)
  EUR: 7.85,    // EUR to CNY (approximate)
  JPY: 0.048,   // JPY to CNY (approximate)
  GBP: 9.15,    // GBP to CNY (approximate)
};

interface ExchangeRate {
  code: string;
  name: string;
  rate: number;  // Rate to CNY
  updateTime: string;
}

async function fetchExchangeRates(): Promise<ExchangeRate[]> {
  const rates: ExchangeRate[] = [];

  try {
    // East Money forex API - get rates for multiple currencies vs CNY/CNH
    // secid format: market.code (106 = forex)
    const secids = [
      { code: 'USDCNY', secid: '106,USDCNY', name: '美元/人民币' },
      { code: 'HKDCNY', secid: '106,HKDCNY', name: '港币/人民币' },
      { code: 'EURCNY', secid: '106,EURCNY', name: '欧元/人民币' },
      { code: 'JPYCNY', secid: '106,JPYCNY', name: '日元/人民币' },
      { code: 'GBPCNY', secid: '106,GBPCNY', name: '英镑/人民币' },
    ];

    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secids.map(s => s.secid).join(',')}&fields=f43,f44,f45,f57,f58,f59,f60,f107`;

    const response = await fetch(url, {
      headers: { 
        'Referer': 'https://quote.eastmoney.com', 
        'User-Agent': 'Mozilla/5.0' 
      },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();

      // East Money returns data in a different format for multiple stocks
      // Each item has f57 = code, f43 = current price
      for (const { code, name } of secids) {
        // Try to find the rate in the data
        // The data might be in data.diff or data[0], data[1], etc.
        let price = 0;

        if (data?.data?.diff) {
          // Some API versions return diff as array
          const item = data.data.diff.find((d: any) => d?.f57 === code);
          if (item) price = item.f43;
        } else if (data?.data) {
          // Or as individual properties
          const item = data.data[code];
          if (item?.f43) price = item.f43;
        }

        // If found, divide by 100 to get actual rate
        if (price > 0) {
          rates.push({
            code,
            name,
            rate: price / 100,
            updateTime: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates from East Money:', error);
  }

  // If we couldn't fetch any rates, return defaults
  if (rates.length === 0) {
    return Object.entries(DEFAULT_RATES).map(([code, rate]) => ({
      code,
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
  const rateMap: Record<string, number> = {};
  for (const r of rates) {
    // Extract currency code (e.g., "USD" from "USDCNY")
    const currency = r.code.replace('CNY', '');
    rateMap[currency] = r.rate;
  }

  return NextResponse.json({
    success: true,
    rates,
    rateMap,
    timestamp: new Date().toISOString(),
  });
}
