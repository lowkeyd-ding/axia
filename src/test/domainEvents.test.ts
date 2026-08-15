import { describe, it, expect } from 'vitest';
import { applyEvent, createCashEvent, EMPTY_PROJECTION_STATE } from '@/lib/domain/events';
import { createMoney } from '@/lib/domain/money';
import { createQuantity } from '@/lib/domain/quantity';
import { projectEvents } from '@/lib/domain/ledgerProjection';

describe('economic events', () => {
  it('applies external cash in idempotently', () => {
    const event = createCashEvent({
      id: 'evt-1',
      accountId: 'acc-1',
      amount: 100,
      currency: 'CNY',
      type: 'external_cash_in',
    });

    const state1 = applyEvent(EMPTY_PROJECTION_STATE, event);
    const state2 = applyEvent(state1, event);

    expect(state1.accounts['acc-1'].balance.amount).toBe(100);
    expect(state2.accounts['acc-1'].balance.amount).toBe(100);
    expect(state2.appliedEventIds).toHaveLength(1);
  });

  it('applies buy and updates balance and position', () => {
    const state = applyEvent(EMPTY_PROJECTION_STATE, createCashEvent({
      id: 'evt-cash',
      accountId: 'acc-1',
      amount: 1000,
      currency: 'CNY',
      type: 'external_cash_in',
    }));

    const buy = applyEvent(state, {
      id: 'evt-buy',
      type: 'buy',
      occurredAt: new Date().toISOString(),
      businessDate: '2026-01-01',
      createdAt: new Date().toISOString(),
      source: 'user',
      status: 'posted',
      idempotencyKey: 'evt-buy',
      accountId: 'acc-1',
      symbol: '600519',
      assetType: 'stock',
      quantity: createQuantity(1),
      price: createMoney(100, { currency: 'CNY' }),
      fees: createMoney(1, { currency: 'CNY' }),
    });

    expect(buy.accounts['acc-1'].balance.amount).toBe(899);
    expect(buy.positions['acc-1:600519:stock'].quantity.value).toBe(1);
  });

  it('applies sell and reduces position quantity', () => {
    const state = projectEvents([
      createCashEvent({ id: 'evt-cash', accountId: 'acc-1', amount: 1000, currency: 'CNY', type: 'external_cash_in' }),
      {
        id: 'evt-buy',
        type: 'buy',
        occurredAt: new Date().toISOString(),
        businessDate: '2026-01-01',
        createdAt: new Date().toISOString(),
        source: 'user',
        status: 'posted',
        idempotencyKey: 'evt-buy',
        accountId: 'acc-1',
        symbol: '600519',
        assetType: 'stock',
        quantity: createQuantity(2),
        price: createMoney(100, { currency: 'CNY' }),
        fees: createMoney(1, { currency: 'CNY' }),
      },
      {
        id: 'evt-sell',
        type: 'sell',
        occurredAt: new Date().toISOString(),
        businessDate: '2026-01-02',
        createdAt: new Date().toISOString(),
        source: 'user',
        status: 'posted',
        idempotencyKey: 'evt-sell',
        accountId: 'acc-1',
        symbol: '600519',
        assetType: 'stock',
        quantity: createQuantity(1),
        price: createMoney(110, { currency: 'CNY' }),
        fees: createMoney(1, { currency: 'CNY' }),
      },
    ]);

    expect(state.accounts['acc-1'].balance.amount).toBe(908);
    expect(state.positions['acc-1:600519:stock'].quantity.value).toBe(1);
  });

  it('applies internal transfer without changing total assets', () => {
    const state = projectEvents([
      createCashEvent({ id: 'evt-a', accountId: 'acc-1', amount: 500, currency: 'CNY', type: 'external_cash_in' }),
      createCashEvent({ id: 'evt-b', accountId: 'acc-2', amount: 200, currency: 'CNY', type: 'external_cash_in' }),
    ]);

    const after = applyEvent(state, {
      id: 'evt-t',
      type: 'internal_transfer',
      occurredAt: new Date().toISOString(),
      businessDate: '2026-01-01',
      createdAt: new Date().toISOString(),
      source: 'user',
      status: 'posted',
      idempotencyKey: 'evt-t',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: createMoney(100, { currency: 'CNY' }),
      currency: 'CNY',
    });

    expect(after.accounts['acc-1'].balance.amount).toBe(400);
    expect(after.accounts['acc-2'].balance.amount).toBe(300);
  });
});
