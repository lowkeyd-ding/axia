import { describe, it, expect } from 'vitest';
import { computeStrictPerformance } from '@/lib/domain/performance';
import { createMoney } from '@/lib/domain/money';

const baseEvent = {
  id: 'e1',
  occurredAt: '2026-01-01T00:00:00.000Z',
  businessDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'user' as const,
  status: 'posted' as const,
  idempotencyKey: 'e1',
  metadata: {},
};

describe('computeStrictPerformance', () => {
  it('computes net asset change and return', () => {
    const result = computeStrictPerformance({
      openingValue: createMoney(100, { currency: 'CNY' }),
      closingValue: createMoney(120, { currency: 'CNY' }),
      events: [],
      observations: [{
        id: 'p1', symbol: 'PORTFOLIO', assetType: 'stock', price: 120, currency: 'CNY', observedAt: '2026-01-10T00:00:00.000Z', fetchedAt: '2026-01-10T00:00:01.000Z', source: 'manual', kind: 'manual', status: 'valid',
      }],
      asOfDate: '2026-01-10',
    });

    expect(result.netAssetChange.amount).toBe(20);
    expect(result.cashFlowAdjustedReturn).toBe(20);
    expect(result.dataQuality.complete).toBe(false);
  });

  it('treats external cash flow explicitly', () => {
    const result = computeStrictPerformance({
      openingValue: createMoney(100, { currency: 'CNY' }),
      closingValue: createMoney(170, { currency: 'CNY' }),
      events: [
        { ...baseEvent, id: 'in1', type: 'external_cash_in', accountId: 'a1', amount: createMoney(50, { currency: 'CNY' }), currency: 'CNY' },
      ] as any,
      observations: [{
        id: 'p1', symbol: 'PORTFOLIO', assetType: 'stock', price: 170, currency: 'CNY', observedAt: '2026-01-10T00:00:00.000Z', fetchedAt: '2026-01-10T00:00:01.000Z', source: 'manual', kind: 'manual', status: 'valid',
      }],
      asOfDate: '2026-01-10',
    });

    expect(result.cashFlowAdjustedReturn).toBeCloseTo(13.3333, 4);
  });

  it('flags missing price data', () => {
    const result = computeStrictPerformance({
      openingValue: createMoney(100, { currency: 'CNY' }),
      closingValue: createMoney(110, { currency: 'CNY' }),
      events: [],
      observations: [],
      asOfDate: '2026-01-10',
    });

    expect(result.dataQuality.complete).toBe(false);
    expect(result.dataQuality.issues.some((issue) => issue.code === 'missing_price')).toBe(true);
  });
});
