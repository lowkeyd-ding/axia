import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/lib/store';

describe('domain audit risks', () => {
  it('deleting a trade should rollback cash and position state', () => {
    const store = useAppStore.getState();
    store.setAccounts([]);
    store.setPositions([]);
    store.setSnapshots([]);
    store.setTrades([]);
    useAppStore.setState({ lots: [], economicEvents: [] });

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

  it('deleting a latest sell restores cash, position quantity and lots', () => {
    const store = useAppStore.getState();
    useAppStore.setState({ accounts: [], positions: [], trades: [], lots: [], economicEvents: [] });
    const account = store.addAccount({ name: 'Audit Account', type: 'securities', currency: 'CNY', balance: 100000 }).data!;
    store.executeTrade({ accountId: account.id, assetType: 'stock', symbol: '600519', name: '贵州茅台', type: 'buy', quantity: 10, price: 1000, total: 10000, fees: 10, executedAt: '2024-01-01T00:00:00.000Z' });
    const sell = store.executeTrade({ accountId: account.id, assetType: 'stock', symbol: '600519', name: '贵州茅台', type: 'sell', quantity: 4, price: 1200, total: 4800, fees: 5, executedAt: '2024-02-01T00:00:00.000Z' });

    expect(store.deleteTrade(sell.trade!.id).success).toBe(true);
    const state = useAppStore.getState();
    expect(state.accounts[0].balance).toBe(89990);
    expect(state.positions[0].quantity).toBe(10);
    expect(state.lots[0].remainingQuantity).toBe(10);
  });

  it('rejects deleting an older trade while later dependent trades exist', () => {
    const store = useAppStore.getState();
    useAppStore.setState({ accounts: [], positions: [], trades: [], lots: [], economicEvents: [] });
    const account = store.addAccount({ name: 'Audit Account', type: 'securities', currency: 'CNY', balance: 100000 }).data!;
    const first = store.executeTrade({ accountId: account.id, assetType: 'stock', symbol: '600519', name: '贵州茅台', type: 'buy', quantity: 10, price: 1000, total: 10000, fees: 0, executedAt: '2024-01-01T00:00:00.000Z' });
    store.executeTrade({ accountId: account.id, assetType: 'stock', symbol: '600519', name: '贵州茅台', type: 'buy', quantity: 5, price: 1100, total: 5500, fees: 0, executedAt: '2024-02-01T00:00:00.000Z' });

    const result = store.deleteTrade(first.trade!.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain('最新一笔');
  });

  it('editing the latest trade rolls back the original before applying the replacement', () => {
    const store = useAppStore.getState();
    useAppStore.setState({ accounts: [], positions: [], trades: [], lots: [], economicEvents: [] });
    const account = store.addAccount({ name: 'Audit Account', type: 'securities', currency: 'CNY', balance: 100000 }).data!;
    const buy = store.executeTrade({ accountId: account.id, assetType: 'stock', symbol: '600519', name: '贵州茅台', type: 'buy', quantity: 10, price: 1000, total: 10000, fees: 10, executedAt: '2024-01-01T00:00:00.000Z' });

    const result = store.updateTrade(buy.trade!.id, { quantity: 8, price: 900, total: 7200, fees: 8 });
    expect(result.success).toBe(true);
    const state = useAppStore.getState();
    expect(state.accounts[0].balance).toBe(92792);
    expect(state.positions[0]).toMatchObject({ quantity: 8, avgCost: 900 });
    expect(state.trades).toHaveLength(1);
  });
});
