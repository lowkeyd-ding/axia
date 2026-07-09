/**
 * Exchange Rates API Client
 * Fetches and caches exchange rates from the server-side API
 */

import { DEFAULT_EXCHANGE_RATES, type ExchangeRates } from '@/config/exchangeRates';

// Cache for exchange rates
let cachedRates: ExchangeRates | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current exchange rates
 * Uses cache if available and not expired
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();

  // Return cached rates if still valid
  if (cachedRates && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    const response = await fetch('/api/rates');
    if (response.ok) {
      const data = await response.json();
      if (data.rateMap) {
        const newRates = { ...DEFAULT_EXCHANGE_RATES, ...data.rateMap };
        cachedRates = newRates;
        cacheTimestamp = now;
        return newRates;
      }
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
  }

  // Return default rates if fetch fails
  return DEFAULT_EXCHANGE_RATES;
}

/**
 * Get rate for a specific currency
 * Returns 1 if currency is CNY or unknown
 */
export function getRate(currency: string, rates: ExchangeRates): number {
  if (currency === 'CNY') return 1;
  return rates[currency] ?? 1;
}

/**
 * Convert amount from one currency to CNY
 */
export function convertToCNY(amount: number, fromCurrency: string, rates: ExchangeRates): number {
  const rate = getRate(fromCurrency, rates);
  return amount * rate;
}
