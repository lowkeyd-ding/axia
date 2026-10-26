import { describe, it, expect } from 'vitest';
import { createSyncPackage, summarizeSyncDiff, unwrapCloudSyncPayload } from '@/lib/sync';

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

  it('round-trips a versioned cloud payload without losing durable collections', () => {
    const source = {
      accounts: [], positions: [], snapshots: [], trades: [], transfers: [], targetAllocations: [], lots: [],
      priceSnapshots: [{ id: 'price-1', symbol: '600519', assetType: 'stock' as const, date: '2026-10-26', price: 1500, currency: 'CNY', source: 'test', createdAt: '2026-10-26T00:00:00.000Z' }],
      economicEvents: [],
      cashAdjustments: [],
    };
    const pkg = createSyncPackage(source);

    expect(unwrapCloudSyncPayload(pkg)).toEqual({ data: source, meta: pkg.meta });
  });

  it('loads legacy unversioned cloud data', () => {
    const legacy = { accounts: [], positions: [], snapshots: [], trades: [], transfers: [], targetAllocations: [], lots: [] };
    expect(unwrapCloudSyncPayload(legacy)).toEqual({ data: { ...legacy, priceSnapshots: [], economicEvents: [], cashAdjustments: [] }, meta: null });
  });

  it('rejects malformed cloud payloads', () => {
    expect(unwrapCloudSyncPayload({ meta: {}, data: { accounts: [] } })).toBeNull();
  });
});
