import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSymbol } from '@/lib/externalPriceApi';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('externalPriceApi - HK East Money divisor', () => {
  it('parses HK stock prices from East Money response without 10x inflation', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              f43: 79200,
              f44: 81000,
              f45: 78000,
              f46: 80500,
              f47: 1234567,
              f58: 'Meituan',
              f60: 78500,
            },
          }),
      } as Response)
    );

    const result = await fetchSymbol('03690');
    expect(result?.symbol).toBe('03690');
    expect(result?.price).toBeCloseTo(79.2, 2);
    expect(result?.high).toBeCloseTo(81.0, 2);
    expect(result?.low).toBeCloseTo(78.0, 2);
    expect(result?.prevClose).toBeCloseTo(78.5, 2);
  });

  it('parses HK Tencent price from East Money without 10x inflation', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              f43: 368000,
              f44: 372000,
              f45: 364000,
              f46: 370000,
              f47: 987654,
              f58: 'Tencent',
              f60: 360000,
            },
          }),
      } as Response)
    );

    const result = await fetchSymbol('00700');
    expect(result?.symbol).toBe('00700');
    expect(result?.price).toBeCloseTo(368.0, 2);
  });
});
