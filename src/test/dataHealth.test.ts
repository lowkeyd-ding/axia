import { describe, it, expect } from 'vitest';
import { inspectDataHealth } from '@/lib/portfolioAnalysis';
import type { Account, Position, Snapshot, Trade, TargetAllocation } from '@/types';

const account: Account = {
  id: 'a1',
  name: 'A',
  type: 'securities',
  balance: 100,
  currency: 'CNY',
  createdAt: '',
  updatedAt: '',
};

const position: Position = {
  id: 'p1',
  accountId: 'a1',
  assetType: 'stock',
  symbol: '600519',
  name: '茅台',
  quantity: 10,
  avgCost: 100,
  currentPrice: 110,
  currency: 'CNY',
  createdAt: '',
  updatedAt: new Date().toISOString(),
};

describe('inspectDataHealth', () => {
  it('detects orphan position', () => {
    const issues = inspectDataHealth({
      accounts: [account],
      positions: [{ ...position, accountId: 'missing' }],
      trades: [],
      snapshots: [],
      targetAllocations: [],
    });
    expect(issues.some((i) => i.id === 'orphan-positions')).toBe(true);
  });

  it('detects invalid quantity and values', () => {
    const issues = inspectDataHealth({
      accounts: [{ ...account, balance: -1 }],
      positions: [{ ...position, quantity: 0, avgCost: NaN }],
      trades: [],
      snapshots: [],
      targetAllocations: [],
    });
    expect(issues.some((i) => i.id === 'position-quantity')).toBe(true);
    expect(issues.some((i) => i.id === 'invalid-values')).toBe(true);
  });

  it('detects bad target allocation', () => {
    const bad: TargetAllocation = {
      id: 't',
      name: 'bad',
      allocations: [{ category: 'stock', percentage: 150 }],
      createdAt: '',
      updatedAt: '',
    };
    const issues = inspectDataHealth({
      accounts: [account],
      positions: [position],
      trades: [],
      snapshots: [],
      targetAllocations: [bad],
    });
    expect(issues.some((i) => i.id === 'target-allocation')).toBe(true);
  });

  it('detects duplicate snapshot dates', () => {
    const snap = (id: string, date: string): Snapshot => ({
      id,
      date,
      totalValue: 1,
      cash: 1,
      investments: 0,
      dailyChange: 0,
      dailyChangePercent: 0,
      totalChange: 0,
      totalChangePercent: 0,
      allocations: [],
      accountValues: [],
      positionValues: [],
      createdAt: date + 'T00:00:00.000Z',
    });
    const issues = inspectDataHealth({
      accounts: [account],
      positions: [position],
      trades: [],
      snapshots: [snap('s1', '2026-07-01'), snap('s2', '2026-07-01')],
      targetAllocations: [],
    });
    expect(issues.some((i) => i.id === 'snapshot-dates')).toBe(true);
  });

  it('detects orphan trades', () => {
    const trade: Trade = {
      id: 'tr',
      accountId: 'missing',
      assetType: 'stock',
      symbol: '1',
      name: 'x',
      type: 'buy',
      quantity: 1,
      price: 1,
      total: 1,
      fees: 0,
      executedAt: '',
      createdAt: '',
    };
    const issues = inspectDataHealth({
      accounts: [account],
      positions: [position],
      trades: [trade],
      snapshots: [],
      targetAllocations: [],
    });
    expect(issues.some((i) => i.id === 'orphan-trades')).toBe(true);
  });
});
