import type { AssetType } from '@/types';
import { createMoney, type Money } from './money';
import { createQuantity, subtractQuantity, type Quantity } from './quantity';
import type { EconomicEvent, ManualPositionOpeningEvent, ProjectionState, TradeEvent } from './events';
import { applyEvent, EMPTY_PROJECTION_STATE } from './events';

export interface LotProjection {
  id: string;
  positionId: string;
  quantity: Quantity;
  remainingQuantity: Quantity;
  price: Money;
  fees: Money;
  openedAt: string;
  closedAt?: string;
}

export interface ProjectedPosition {
  id: string;
  accountId: string;
  symbol: string;
  assetType: AssetType;
  quantity: Quantity;
  avgCost: Money;
  currentPrice: Money;
  unrealizedPnL: Money;
}

export interface ProjectionResult {
  state: ProjectionState;
  lots: LotProjection[];
  realizedPnL: Money;
  unrealizedPnL: Money;
  currentCashByAccount: Record<string, Money>;
  projectedPositions: ProjectedPosition[];
}

function createZeroMoney(currency: Money['currency']): Money {
  return createMoney(0, { currency });
}

export function projectLedger(events: EconomicEvent[]): ProjectionResult {
  let state = EMPTY_PROJECTION_STATE;
  const lots: LotProjection[] = [];
  let realizedPnL = createZeroMoney('CNY');
  const currentCashByAccount: Record<string, Money> = {};

  for (const event of events) {
    state = applyEvent(state, event);

    if (event.type === 'buy') {
      const tradeEvent = event as TradeEvent;
      const positionId = tradeEvent.positionId || `${tradeEvent.accountId}:${tradeEvent.symbol}:${tradeEvent.assetType}`;
      lots.push({
        id: tradeEvent.id,
        positionId,
        quantity: tradeEvent.quantity,
        remainingQuantity: tradeEvent.quantity,
        price: tradeEvent.price,
        fees: tradeEvent.fees,
        openedAt: tradeEvent.occurredAt,
      });
      currentCashByAccount[tradeEvent.accountId] = state.accounts[tradeEvent.accountId]?.balance || createZeroMoney(tradeEvent.price.currency);
    }

    if (event.type === 'sell') {
      const tradeEvent = event as TradeEvent;
      const positionId = tradeEvent.positionId || `${tradeEvent.accountId}:${tradeEvent.symbol}:${tradeEvent.assetType}`;
      let remainingToSell = tradeEvent.quantity;
      for (const lot of lots) {
        if (lot.positionId !== positionId || lot.remainingQuantity.value <= 0) continue;
        const matched = Math.min(lot.remainingQuantity.value, remainingToSell.value);
        if (matched <= 0) continue;
        const sold = createQuantity(matched, Math.max(lot.remainingQuantity.scale, remainingToSell.scale));
        lot.remainingQuantity = subtractQuantity(lot.remainingQuantity, sold);
        remainingToSell = subtractQuantity(remainingToSell, sold);
        if (lot.remainingQuantity.value === 0) {
          lot.closedAt = tradeEvent.occurredAt;
        }
        const lotPnL = (tradeEvent.price.amount - lot.price.amount) * matched - (tradeEvent.fees.amount / Math.max(tradeEvent.quantity.value, 1));
        realizedPnL = createMoney(realizedPnL.amount + lotPnL, { currency: tradeEvent.price.currency });
        if (remainingToSell.value <= 0) break;
      }
      currentCashByAccount[tradeEvent.accountId] = state.accounts[tradeEvent.accountId]?.balance || createZeroMoney(tradeEvent.price.currency);
    }

    if (event.type === 'external_cash_in' || event.type === 'external_cash_out' || event.type === 'manual_balance_adjustment') {
      const cashEvent = event as any;
      const accountId = cashEvent.accountId;
      const currency = cashEvent.amount.currency;
      currentCashByAccount[accountId] = state.accounts[accountId]?.balance || createZeroMoney(currency);
    }

    if (event.type === 'internal_transfer') {
      const transferEvent = event as any;
      const currency = transferEvent.amount.currency;
      currentCashByAccount[transferEvent.fromAccountId] = state.accounts[transferEvent.fromAccountId]?.balance || createZeroMoney(currency);
      currentCashByAccount[transferEvent.toAccountId] = state.accounts[transferEvent.toAccountId]?.balance || createZeroMoney(currency);
    }
  }

  const projectedPositions: ProjectedPosition[] = Object.values(state.positions).map((position) => {
    const unrealized = (position.currentPrice.amount - position.avgCost.amount) * position.quantity.value;
    return {
      id: position.id,
      accountId: position.accountId,
      symbol: position.symbol,
      assetType: position.assetType,
      quantity: position.quantity,
      avgCost: position.avgCost,
      currentPrice: position.currentPrice,
      unrealizedPnL: createMoney(unrealized, { currency: position.currentPrice.currency }),
    };
  });

  const unrealizedPnL = projectedPositions.reduce((sum, position) => sum + position.unrealizedPnL.amount, 0);

  return {
    state,
    lots,
    realizedPnL,
    unrealizedPnL: createMoney(unrealizedPnL, { currency: 'CNY' }),
    currentCashByAccount,
    projectedPositions,
  };
}
