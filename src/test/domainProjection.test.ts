import { describe, it, expect } from 'vitest';
import { createCashEvent } from '@/lib/domain/events';
import { createMoney } from '@/lib/domain/money';
import { createQuantity } from '@/lib/domain/quantity';
import { projectLedger } from '@/lib/domain/positionProjection';

describe('position projection', () => {
  it('projects buy sell and realized pnl with FIFO lots', () => {
    const events = [
      createCashEvent({ id: 'cash-1', accountId: 'acc-1', amount: 100000, currency: 'CNY', type: 'external_cash_in' }),
      {
        id: 'buy-1',
        type: 'buy',
        occurredAt: '2026-01-01T00:00:00.000Z',
        businessDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'user',
        status: 'posted',
        idempotencyKey: 'buy-1',
        accountId: 'acc-1',
        symbol: '600519',
        assetType: 'stock' as const,
        quantity: createQuantity(10),
        price: createMoney(100, { currency: 'CNY' }),
        fees: createMoney(10, { currency: 'CNY' }),
      },
      {
        id: 'sell-1',
        type: 'sell',
        occurredAt: '2026-01-02T00:00:00.000Z',
        businessDate: '2026-01-02',
        createdAt: '2026-01-02T00:00:00.000Z',
        source: 'user',
        status: 'posted',
        idempotencyKey: 'sell-1',
        accountId: 'acc-1',
        symbol: '600519',
        assetType: 'stock' as const,
        quantity: createQuantity(4),
        price: createMoney(110, { currency: 'CNY' }),
        fees: createMoney(4, { currency: 'CNY' }),
      },
    ] as const;

    const result = projectLedger(events as any);
    expect(result.state.accounts['acc-1'].balance.amount).toBe(100000 - 1000 - 10 + 440 - 4);
    expect(result.projectedPositions[0].quantity.value).toBe(6);
    expect(result.realizedPnL.amount).toBeGreaterThan(0);
  });

  it('keeps internal transfer out of realized pnl', () => {
    const result = projectLedger([
      createCashEvent({ id: 'cash-1', accountId: 'acc-1', amount: 1000, currency: 'CNY', type: 'external_cash_in' }),
      {
        id: 'transfer-1',
        type: 'internal_transfer',
        occurredAt: '2026-01-02T00:00:00.000Z',
        businessDate: '2026-01-02',
        createdAt: '2026-01-02T00:00:00.000Z',
        source: 'user',
        status: 'posted',
        idempotencyKey: 'transfer-1',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: createMoney(100, { currency: 'CNY' }),
        currency: 'CNY',
      } as any,
    ]);

    expect(result.state.accounts['acc-1'].balance.amount).toBe(900);
    expect(result.state.accounts['acc-2'].balance.amount).toBe(100);
    expect(result.realizedPnL.amount).toBe(0);
  });
});
