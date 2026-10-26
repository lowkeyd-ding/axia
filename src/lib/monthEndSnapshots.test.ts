import { describe, expect, it } from 'vitest';
import { buildSnapshotAtDate } from '@/lib/monthEndSnapshots';

const account = { id: 'a1', name: '证券', type: 'securities' as const, balance: 900, currency: 'CNY', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' };
const position = { id: 'p1', accountId: 'a1', assetType: 'stock' as const, symbol: 'TEST', name: '测试', quantity: 1, avgCost: 100, currentPrice: 120, buyDate: '2026-01-10', createdAt: '2026-01-10T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' };
const trade = { id: 't1', positionId: 'p1', accountId: 'a1', assetType: 'stock' as const, symbol: 'TEST', name: '测试', type: 'buy' as const, quantity: 1, price: 100, total: 100, fees: 0, executedAt: '2026-01-10T00:00:00.000Z', createdAt: '2026-01-10T00:00:00.000Z' };

describe('historical snapshot projection', () => {
  it('uses observations at or before the requested date', () => {
    const result = buildSnapshotAtDate({
      date: '2026-01-31', accounts: [account], positions: [position], trades: [trade], transfers: [],
      fxRates: { HKD: 1, USD: 1, EUR: 1, JPY: 1, GBP: 1 },
      priceSnapshots: [
        { symbol: 'TEST', date: '2026-01-30', price: 110, currency: 'CNY' },
        { symbol: 'TEST', date: '2026-02-01', price: 999, currency: 'CNY' },
      ],
    });
    expect(result?.date).toBe('2026-01-31');
    expect(result?.positionValues[0].currentPrice).toBe(110);
    expect(result?.dataQuality.complete).toBe(true);
  });

  it('reports missing historical prices instead of silently using current price', () => {
    const result = buildSnapshotAtDate({ date: '2026-01-31', accounts: [account], positions: [position], trades: [trade], transfers: [], fxRates: { HKD: 1, USD: 1, EUR: 1, JPY: 1, GBP: 1 }, priceSnapshots: [] });
    expect(result?.investments).toBe(0);
    expect(result?.dataQuality.complete).toBe(false);
    expect(result?.dataQuality.issues[0]).toContain('TEST');
  });
});
