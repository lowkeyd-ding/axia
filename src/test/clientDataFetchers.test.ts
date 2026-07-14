import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSinaForexRates } from '@/lib/forexApi';
import { getPrice } from '@/lib/priceApi';
import { getHkexSettlementRate } from '@/lib/hkexRateClient';

describe('forexApi - Sina FX regression', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses valid Sina forex response', async () => {
    const body = `hq_str_fx_shkdcny="27/Mar/2026 00:00,0.8648,0.8652,0.8647,0.8653,0.01,0.02"
hq_str_fx_susdcny="27/Mar/2026 00:00,7.245,7.265,7.240,7.270,0.001,0.002"
hq_str_fx_seurcny="27/Mar/2026 00:00,7.830,7.860,7.820,7.870,0.005,0.010"
hq_str_fx_sjpycny="27/Mar/2026 00:00,0.0475,0.0480,0.0473,0.0482,0.0001,0.0002"
hq_str_fx_sgbpcny="27/Mar/2026 00:00,9.120,9.150,9.110,9.160,0.010,0.020"
`;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(body),
      } as Response)
    );

    const result = await fetchSinaForexRates();

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.code)).toEqual(['HKD', 'USD', 'EUR', 'JPY', 'GBP']);
    expect(result.find((r) => r.code === 'USD')?.rate).toBeCloseTo(7.265, 3);
    expect(result.find((r) => r.code === 'JPY')?.rate).toBeCloseTo(0.048, 3);
  });

  it('returns empty array on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network')));

    const result = await fetchSinaForexRates();
    expect(result).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      } as Response)
    );

    const result = await fetchSinaForexRates();
    expect(result).toEqual([]);
  });
});

describe('priceApi - getPrice fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('falls back to mock for known A-share when fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false } as Response));

    const result = await getPrice('600519');
    expect(result?.symbol).toBe('600519');
    expect(result?.source).toBe('manual');
  });

  it('falls back to mock for known HK stock when fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false } as Response));

    const result = await getPrice('00700');
    expect(result?.symbol).toBe('00700');
    expect(result?.source).toBe('manual');
  });

  it('returns null for unknown symbol when fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false } as Response));

    const result = await getPrice('XXXXXX');
    expect(result).toBeNull();
  });
});

describe('hkexRateClient - regression', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete (process.env as Record<string, string | undefined>)['NEXT_PUBLIC_SUPABASE_URL'];
    delete (process.env as Record<string, string | undefined>)['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  });

  it('returns default rate when Supabase env vars are missing', async () => {
    const result = await getHkexSettlementRate();
    expect(result.rate.bid).toBeGreaterThan(0);
    expect(result.rate.ask).toBeGreaterThan(0);
    expect(result.source).toBe('default');
  });
});
