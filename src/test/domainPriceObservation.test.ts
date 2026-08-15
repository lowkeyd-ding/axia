import { describe, it, expect } from 'vitest';
import { createPriceObservation, currentPriceFromObservations, historicalValuationAt } from '@/lib/domain/priceObservation';

describe('price observation', () => {
  it('selects latest valid current price', () => {
    const price = currentPriceFromObservations([
      createPriceObservation({
        id: 'p1',
        symbol: '600519',
        assetType: 'stock',
        price: 100,
        currency: 'CNY',
        observedAt: '2026-01-01T10:00:00.000Z',
        source: 'manual',
        kind: 'manual',
        status: 'valid',
        fetchedAt: '2026-01-01T10:00:01.000Z',
      }),
      createPriceObservation({
        id: 'p2',
        symbol: '600519',
        assetType: 'stock',
        price: 110,
        currency: 'CNY',
        observedAt: '2026-01-02T10:00:00.000Z',
        source: 'manual',
        kind: 'manual',
        status: 'valid',
        fetchedAt: '2026-01-02T10:00:01.000Z',
      }),
    ]);

    expect(price?.price).toBe(110);
  });

  it('does not use future observations for historical valuation', () => {
    const result = historicalValuationAt('600519', '2026-01-01', [
      createPriceObservation({
        id: 'p1',
        symbol: '600519',
        assetType: 'stock',
        price: 100,
        currency: 'CNY',
        observedAt: '2026-01-01T10:00:00.000Z',
        source: 'manual',
        kind: 'manual',
        status: 'valid',
      }),
      createPriceObservation({
        id: 'p2',
        symbol: '600519',
        assetType: 'stock',
        price: 110,
        currency: 'CNY',
        observedAt: '2026-01-02T10:00:00.000Z',
        source: 'manual',
        kind: 'manual',
        status: 'valid',
      }),
    ]);

    expect(result.complete).toBe(true);
    expect(result.price).toBe(100);
  });

  it('flags missing historical valuation', () => {
    const result = historicalValuationAt('600519', '2026-01-01', []);
    expect(result.complete).toBe(false);
    expect(result.missingReason).toContain('缺少');
  });
});
