import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/lib/store';

describe('domain audit risks', () => {
  it.fails('deleting a trade should rollback cash and position state', () => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);

    const account = store.addAccount({
      name: 'Audit Account',
      type: 'securities',
      currency: 'CNY',
      balance: 100000,
    }).data!;

    const trade = store.executeTrade({
      accountId: account.id,
      assetType: 'stock',
      symbol: '600519',
      name: '贵州茅台',
      type: 'buy',
      quantity: 10,
      price: 1000,
      total: 10000,
      fees: 10,
      executedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(trade.success).toBe(true);
    const beforeDelete = useAppStore.getState();
    expect(beforeDelete.accounts[0].balance).toBe(89990);
    expect(beforeDelete.positions.length).toBe(1);

    const deleteResult = store.deleteTrade(trade.trade!.id);
    expect(deleteResult.success).toBe(true);

    const afterDelete = useAppStore.getState();
    expect(afterDelete.accounts[0].balance).toBe(100000);
    expect(afterDelete.positions.length).toBe(0);
  });
});
