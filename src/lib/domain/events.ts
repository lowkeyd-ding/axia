import type { Account, AssetType } from '@/types';
import type { CurrencyCode } from './money';
import type { Quantity } from './quantity';
import { createMoney, type Money } from './money';
import { createQuantity } from './quantity';
import { getBusinessDate } from './businessDate';

export type EconomicEventType =
  | 'external_cash_in'
  | 'external_cash_out'
  | 'internal_transfer'
  | 'buy'
  | 'sell'
  | 'manual_position_opening'
  | 'manual_balance_adjustment'
  | 'price_observation'
  | 'snapshot_recorded';

export type EventSource = 'user' | 'import' | 'sync' | 'system';
export type EventStatus = 'pending' | 'posted' | 'reversed' | 'cancelled';

export interface BaseEconomicEvent {
  id: string;
  type: EconomicEventType;
  occurredAt: string;
  businessDate: string;
  createdAt: string;
  source: EventSource;
  status: EventStatus;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CashEvent extends BaseEconomicEvent {
  accountId: string;
  amount: Money;
  currency: CurrencyCode;
}

export interface TransferEvent extends BaseEconomicEvent {
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
  currency: CurrencyCode;
}

export interface TradeEvent extends BaseEconomicEvent {
  accountId: string;
  positionId?: string;
  symbol: string;
  assetType: AssetType;
  quantity: Quantity;
  price: Money;
  fees: Money;
}

export interface ManualPositionOpeningEvent extends BaseEconomicEvent {
  accountId: string;
  symbol: string;
  assetType: AssetType;
  quantity: Quantity;
  avgCost: Money;
  currentPrice: Money;
  currency: CurrencyCode;
  buyDate: string;
}

export interface PriceObservationEvent extends BaseEconomicEvent {
  symbol: string;
  assetType: AssetType;
  price: Money;
  observedAt: string;
  sourceLabel: string;
  isClosingPrice: boolean;
  isManual: boolean;
  valid: boolean;
  errorMessage?: string;
}

export interface SnapshotRecordedEvent extends BaseEconomicEvent {
  snapshotId: string;
}

export type EconomicEvent =
  | CashEvent
  | TransferEvent
  | TradeEvent
  | ManualPositionOpeningEvent
  | PriceObservationEvent
  | SnapshotRecordedEvent;

export interface ProjectionAccount {
  id: string;
  balance: Money;
}

export interface ProjectionPosition {
  id: string;
  accountId: string;
  symbol: string;
  assetType: AssetType;
  quantity: Quantity;
  avgCost: Money;
  currentPrice: Money;
}

export interface ProjectionState {
  accounts: Record<string, ProjectionAccount>;
  positions: Record<string, ProjectionPosition>;
  eventsById: Record<string, EconomicEvent>;
  appliedEventIds: string[];
}

export const EMPTY_PROJECTION_STATE: ProjectionState = {
  accounts: {},
  positions: {},
  eventsById: {},
  appliedEventIds: [],
};

function cloneState(state: ProjectionState): ProjectionState {
  return {
    accounts: { ...state.accounts },
    positions: { ...state.positions },
    eventsById: { ...state.eventsById },
    appliedEventIds: [...state.appliedEventIds],
  };
}

function ensureAccount(state: ProjectionState, accountId: string, currency: CurrencyCode): ProjectionAccount {
  const existing = state.accounts[accountId];
  if (existing) return existing;
  const created = { id: accountId, balance: createMoney(0, { currency }) };
  state.accounts[accountId] = created;
  return created;
}

function ensurePosition(state: ProjectionState, event: TradeEvent | ManualPositionOpeningEvent): ProjectionPosition {
  const positionId = 'positionId' in event && event.positionId ? event.positionId : `${event.accountId}:${event.symbol}:${event.assetType}`;
  const existing = state.positions[positionId];
  if (existing) return existing;
  const created = {
    id: positionId,
    accountId: event.accountId,
    symbol: event.symbol,
    assetType: event.assetType,
    quantity: createQuantity(0),
    avgCost: createMoney(0, { currency: 'CNY' }),
    currentPrice: createMoney(0, { currency: 'CNY' }),
  };
  state.positions[positionId] = created;
  return created;
}

export function applyEvent(previousState: ProjectionState, event: EconomicEvent): ProjectionState {
  if (previousState.eventsById[event.id]) {
    return previousState;
  }

  const state = cloneState(previousState);
  state.eventsById[event.id] = event;
  state.appliedEventIds.push(event.id);

  switch (event.type) {
    case 'external_cash_in': {
      const cashEvent = event as CashEvent;
      const account = ensureAccount(state, cashEvent.accountId, cashEvent.currency);
      account.balance = createMoney(account.balance.amount + cashEvent.amount.amount, { currency: cashEvent.currency });
      break;
    }
    case 'external_cash_out': {
      const cashEvent = event as CashEvent;
      const account = ensureAccount(state, cashEvent.accountId, cashEvent.currency);
      account.balance = createMoney(account.balance.amount - cashEvent.amount.amount, { currency: cashEvent.currency });
      break;
    }
    case 'internal_transfer': {
      const transferEvent = event as TransferEvent;
      const from = ensureAccount(state, transferEvent.fromAccountId, transferEvent.currency);
      const to = ensureAccount(state, transferEvent.toAccountId, transferEvent.currency);
      from.balance = createMoney(from.balance.amount - transferEvent.amount.amount, { currency: transferEvent.currency });
      to.balance = createMoney(to.balance.amount + transferEvent.amount.amount, { currency: transferEvent.currency });
      break;
    }
    case 'manual_balance_adjustment': {
      const cashEvent = event as CashEvent;
      const account = ensureAccount(state, cashEvent.accountId, cashEvent.currency);
      account.balance = createMoney(account.balance.amount + cashEvent.amount.amount, { currency: cashEvent.currency });
      break;
    }
    case 'buy': {
      const tradeEvent = event as TradeEvent;
      const account = ensureAccount(state, tradeEvent.accountId, tradeEvent.price.currency);
      const position = ensurePosition(state, tradeEvent);
      const totalCost = tradeEvent.quantity.value * tradeEvent.price.amount + tradeEvent.fees.amount;
      account.balance = createMoney(account.balance.amount - totalCost, { currency: account.balance.currency });
      const newQuantity = createQuantity(position.quantity.value + tradeEvent.quantity.value, Math.max(position.quantity.scale, tradeEvent.quantity.scale));
      const previousCost = position.avgCost.amount * position.quantity.value;
      const newAvgCost = newQuantity.value > 0
        ? createMoney((previousCost + tradeEvent.quantity.value * tradeEvent.price.amount + tradeEvent.fees.amount) / newQuantity.value, { currency: tradeEvent.price.currency })
        : position.avgCost;
      position.quantity = newQuantity;
      position.avgCost = newAvgCost;
      position.currentPrice = tradeEvent.price;
      break;
    }
    case 'sell': {
      const tradeEvent = event as TradeEvent;
      const account = ensureAccount(state, tradeEvent.accountId, tradeEvent.price.currency);
      const position = ensurePosition(state, tradeEvent);
      const proceeds = tradeEvent.quantity.value * tradeEvent.price.amount - tradeEvent.fees.amount;
      account.balance = createMoney(account.balance.amount + proceeds, { currency: account.balance.currency });
      const remaining = Math.max(position.quantity.value - tradeEvent.quantity.value, 0);
      position.quantity = createQuantity(remaining, Math.max(position.quantity.scale, tradeEvent.quantity.scale));
      position.currentPrice = tradeEvent.price;
      break;
    }
    case 'manual_position_opening': {
      const positionEvent = event as ManualPositionOpeningEvent;
      const account = ensureAccount(state, positionEvent.accountId, positionEvent.currentPrice.currency);
      const positionId = `${positionEvent.accountId}:${positionEvent.symbol}:${positionEvent.assetType}`;
      state.positions[positionId] = {
        id: positionId,
        accountId: positionEvent.accountId,
        symbol: positionEvent.symbol,
        assetType: positionEvent.assetType,
        quantity: positionEvent.quantity,
        avgCost: positionEvent.avgCost,
        currentPrice: positionEvent.currentPrice,
      };
      break;
    }
    case 'price_observation': {
      break;
    }
    case 'snapshot_recorded': {
      break;
    }
  }

  return state;
}

export function createCashEvent(params: {
  id: string;
  accountId: string;
  amount: number;
  currency: CurrencyCode;
  type: 'external_cash_in' | 'external_cash_out' | 'manual_balance_adjustment';
  source?: EventSource;
  status?: EventStatus;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}): EconomicEvent {
  return {
    id: params.id,
    type: params.type,
    occurredAt: params.occurredAt || new Date().toISOString(),
    businessDate: getBusinessDate(),
    createdAt: new Date().toISOString(),
    source: params.source || 'user',
    status: params.status || 'posted',
    idempotencyKey: params.id,
    accountId: params.accountId,
    amount: createMoney(params.amount, { currency: params.currency }),
    currency: params.currency,
    metadata: params.metadata,
  } as EconomicEvent;
}
