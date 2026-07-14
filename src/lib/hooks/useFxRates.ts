'use client';

/**
 * useFxRates
 * React hook that fetches and caches FX + HKEX rates.
 * Always returns a non-null FxRates (defaults on first render, live data after).
 *
 * import { useFxRates } from '@/lib/hooks/useFxRates';
 * const { rates, loading } = useFxRates();
 */

import { useState, useEffect, useCallback } from 'react';
import { getFxRates, type FxRates } from '@/lib/fx';
import { DEFAULT_EXCHANGE_RATES } from '@/config/exchangeRates';

const DEFAULTS: FxRates = {
  HKD: DEFAULT_EXCHANGE_RATES.HKD,
  USD: DEFAULT_EXCHANGE_RATES.USD,
  EUR: DEFAULT_EXCHANGE_RATES.EUR,
  JPY: DEFAULT_EXCHANGE_RATES.JPY,
  GBP: DEFAULT_EXCHANGE_RATES.GBP,
};

export function useFxRates() {
  const [rates, setRates] = useState<FxRates>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getFxRates();
      setRates(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { rates, loading, refresh: load };
}
