import { describe, it, expect } from 'vitest';
import { buildDashboardSummary } from '@/lib/dashboard';

describe('dashboard summary', () => {
  it('prioritizes sync conflict and actions', () => {
    const summary = buildDashboardSummary({
      accounts: [],
      positions: [],
      snapshots: [],
      transfers: [],
      pnlStats: { daily: { change: 0, changePercent: 0 }, monthly: { change: 0, changePercent: 0 }, yearly: { change: 0, changePercent: 0 } },
      syncStatus: 'conflict',
      syncError: '冲突',
      priceUpdatedAt: null,
      dataQuality: { complete: true, issues: [] },
      fxRates: { HKD: 1, USD: 1, EUR: 1, JPY: 1, GBP: 1 },
    });

    expect(summary.health.syncStatus).toBe('conflict');
    expect(summary.actions[0].label).toContain('处理同步冲突');
  });
});
