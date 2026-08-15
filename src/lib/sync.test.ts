import { describe, it, expect } from 'vitest';
import { createSyncPackage, summarizeSyncDiff } from '@/lib/sync';

describe('versioned sync', () => {
  it('creates a sync package with revision metadata', () => {
    const pkg = createSyncPackage({
      accounts: [],
      positions: [],
      snapshots: [],
      trades: [],
      transfers: [],
      targetAllocations: [],
      lots: [],
      priceSnapshots: [],
    });

    expect(pkg.meta.schemaVersion).toBe(1);
    expect(pkg.meta.revision).toBe(1);
    expect(pkg.meta.deviceId).toBeDefined();
  });

  it('summarizes diff counts', () => {
    const summary = summarizeSyncDiff(
      { accounts: [{ id: 'a1', name: 'A', type: 'bank', balance: 1, currency: 'CNY', createdAt: '1', updatedAt: '1' }], positions: [], snapshots: [], trades: [], transfers: [], targetAllocations: [], lots: [], priceSnapshots: [] },
      { accounts: [{ id: 'a1', name: 'A2', type: 'bank', balance: 2, currency: 'CNY', createdAt: '1', updatedAt: '1' }, { id: 'a2', name: 'B', type: 'bank', balance: 1, currency: 'CNY', createdAt: '1', updatedAt: '1' }], positions: [], snapshots: [], trades: [], transfers: [], targetAllocations: [], lots: [], priceSnapshots: [] }
    );

    expect(summary.accounts.added).toBe(1);
    expect(summary.accounts.modified).toBe(1);
  });
});
