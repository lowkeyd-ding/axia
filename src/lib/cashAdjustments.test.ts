import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/lib/store';

describe('income and expense cash adjustments', () => {
  beforeEach(() => {
    useAppStore.setState({ accounts: [], cashAdjustments: [], economicEvents: [] });
  });

  it('posts and reverses dividend income', () => {
    const store = useAppStore.getState();
    const account = store.addAccount({ name: '证券', type: 'securities', balance: 1000, currency: 'CNY' }).data!;
    const added = store.addCashAdjustment({ accountId: account.id, category: 'dividend', amount: 100, currency: 'CNY', symbol: '600519', occurredAt: '2026-01-01T00:00:00.000Z' });
    expect(added.success).toBe(true);
    expect(useAppStore.getState().accounts[0].balance).toBe(1100);
    expect(useAppStore.getState().economicEvents.at(-1)?.metadata?.category).toBe('dividend');
    expect(store.deleteCashAdjustment(added.data!.id).success).toBe(true);
    expect(useAppStore.getState().accounts[0].balance).toBe(1000);
  });

  it('deducts tax and rejects an unaffordable fee', () => {
    const store = useAppStore.getState();
    const account = store.addAccount({ name: '证券', type: 'securities', balance: 100, currency: 'CNY' }).data!;
    expect(store.addCashAdjustment({ accountId: account.id, category: 'tax', amount: 20, currency: 'CNY', occurredAt: '2026-01-01T00:00:00.000Z' }).success).toBe(true);
    expect(useAppStore.getState().accounts[0].balance).toBe(80);
    expect(store.addCashAdjustment({ accountId: account.id, category: 'fee', amount: 100, currency: 'CNY', occurredAt: '2026-01-02T00:00:00.000Z' }).success).toBe(false);
  });
});
