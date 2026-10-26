import { describe, expect, it } from 'vitest';
import type { Snapshot, Transfer } from '@/types';
import { computeAdvancedPerformance, computeTimeWeightedReturn, computeXirr } from '@/lib/performance';

const snapshot = (id: string, date: string, totalValue: number): Snapshot => ({ id, date, totalValue, cash: totalValue, investments: 0, dailyChange: 0, dailyChangePercent: 0, totalChange: 0, totalChangePercent: 0, allocations: [], accountValues: [], positionValues: [], createdAt: `${date}T00:00:00.000Z` });

describe('advanced portfolio performance', () => {
  it('computes linked TWR while removing external deposits', () => {
    const snapshots = [snapshot('s1', '2025-01-01', 100), snapshot('s2', '2025-07-01', 160), snapshot('s3', '2026-01-01', 176)];
    const transfers: Transfer[] = [{ id: 't1', fromAccountId: 'external', toAccountId: 'a1', amount: 50, currency: 'CNY', createdAt: '2025-06-01T00:00:00.000Z' }];
    expect(computeTimeWeightedReturn(snapshots, transfers)).toBeCloseTo(21, 6);
  });

  it('computes annualized XIRR for a one-year holding', () => {
    expect(computeXirr([snapshot('s1', '2025-01-01', 100), snapshot('s2', '2026-01-01', 110)], [])).toBeCloseTo(10, 5);
  });

  it('reports insufficient data explicitly', () => {
    const result = computeAdvancedPerformance([snapshot('s1', '2025-01-01', 100)], []);
    expect(result.complete).toBe(false);
    expect(result.issues[0]).toContain('至少需要');
  });
});
