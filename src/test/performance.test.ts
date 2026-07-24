import { describe, it, expect } from 'vitest';
import { computeCashFlowAdjustedPerformance } from '@/lib/performance';

const baseSnapshot = {
  id: 's1',
  date: '2026-07-01',
  totalValue: 100,
  cash: 100,
  investments: 0,
  dailyChange: 0,
  dailyChangePercent: 0,
  totalChange: 0,
  totalChangePercent: 0,
  allocations: [],
  accountValues: [],
  positionValues: [],
  createdAt: '2026-07-01T00:00:00.000Z',
};

const makeSnapshot = (overrides: Partial<typeof baseSnapshot>) => ({ ...baseSnapshot, ...overrides });

const inflow = { id: 't1', fromAccountId: 'external', toAccountId: 'a1', amount: 50, currency: 'CNY', createdAt: '2026-07-03T08:00:00.000Z' };
const outflow = { id: 't2', fromAccountId: 'a1', toAccountId: 'external', amount: 20, currency: 'CNY', createdAt: '2026-07-04T08:00:00.000Z' };
const internal = { id: 't3', fromAccountId: 'a1', toAccountId: 'a2', amount: 30, currency: 'CNY', createdAt: '2026-07-05T08:00:00.000Z' };

describe('computeCashFlowAdjustedPerformance', () => {
  it('returns null when snapshots are insufficient', () => {
    expect(computeCashFlowAdjustedPerformance([baseSnapshot], [])).toBeNull();
  });

  it('handles no cash flow', () => {
    const result = computeCashFlowAdjustedPerformance([
      makeSnapshot({ id: 's1', date: '2026-07-01', totalValue: 100 }),
      makeSnapshot({ id: 's2', date: '2026-07-10', totalValue: 120, createdAt: '2026-07-10T00:00:00.000Z' }),
    ], []);
    expect(result?.cumulativeReturnPercent).toBe(20);
  });

  it('subtracts external inflow', () => {
    const result = computeCashFlowAdjustedPerformance([
      makeSnapshot({ id: 's1', date: '2026-07-01', totalValue: 100 }),
      makeSnapshot({ id: 's2', date: '2026-07-10', totalValue: 170, createdAt: '2026-07-10T00:00:00.000Z' }),
    ], [inflow]);
    expect(result?.cumulativeReturnPercent).toBeCloseTo(13.3333, 4);
  });

  it('subtracts external outflow', () => {
    const result = computeCashFlowAdjustedPerformance([
      makeSnapshot({ id: 's1', date: '2026-07-01', totalValue: 100 }),
      makeSnapshot({ id: 's2', date: '2026-07-10', totalValue: 80, createdAt: '2026-07-10T00:00:00.000Z' }),
    ], [outflow]);
    expect(result?.cumulativeReturnPercent).toBeCloseTo(0, 4);
  });

  it('ignores internal transfers', () => {
    const result = computeCashFlowAdjustedPerformance([
      makeSnapshot({ id: 's1', date: '2026-07-01', totalValue: 100 }),
      makeSnapshot({ id: 's2', date: '2026-07-10', totalValue: 120, createdAt: '2026-07-10T00:00:00.000Z' }),
    ], [internal]);
    expect(result?.cumulativeReturnPercent).toBe(20);
  });

  it('returns null when snapshots are too ambiguous', () => {
    expect(computeCashFlowAdjustedPerformance([
      makeSnapshot({ id: 's1', date: '2026-07-01', totalValue: 100 }),
      makeSnapshot({ id: 's2', date: '2026-07-01', totalValue: 120, createdAt: '2026-07-01T12:00:00.000Z' }),
    ], [])).toBeNull();
  });

  it('handles unsorted snapshots', () => {
    const result = computeCashFlowAdjustedPerformance([
      makeSnapshot({ id: 's2', date: '2026-07-10', totalValue: 120, createdAt: '2026-07-10T00:00:00.000Z' }),
      makeSnapshot({ id: 's1', date: '2026-07-01', totalValue: 100, createdAt: '2026-07-01T00:00:00.000Z' }),
    ], []);
    expect(result?.cumulativeReturnPercent).toBe(20);
  });
});
