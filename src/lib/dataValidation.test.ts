import { describe, expect, it } from 'vitest';
import { validateCloudSyncData } from '@/lib/dataValidation';

const valid = {
  accounts: [{ id: 'a1', name: 'A', type: 'bank', balance: 1, currency: 'CNY', createdAt: 'x', updatedAt: 'x' }],
  positions: [], snapshots: [], trades: [], transfers: [], targetAllocations: [], lots: [],
};

describe('durable data validation', () => {
  it('normalizes optional durable collections', () => {
    const result = validateCloudSyncData(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ priceSnapshots: [], economicEvents: [] });
  });

  it('rejects non-finite monetary values', () => {
    const result = validateCloudSyncData({ ...valid, accounts: [{ ...valid.accounts[0], balance: Number.NaN }] });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects broken references and duplicate ids', () => {
    expect(validateCloudSyncData({ ...valid, positions: [{ id: 'p1', accountId: 'missing', symbol: 'X', quantity: 1, avgCost: 1, currentPrice: 1 }] }).ok).toBe(false);
    expect(validateCloudSyncData({ ...valid, accounts: [valid.accounts[0], valid.accounts[0]] }).ok).toBe(false);
  });
});
