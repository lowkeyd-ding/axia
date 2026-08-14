'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { useFxRates } from './useFxRates';
import { convertToAccountCNY, getPositionCurrency, type FxRates } from '@/lib/fx';
import { getBusinessDate } from '@/lib/businessDate';
import {
  calculateDailyReturn,
  calculateMonthlyReturn,
  calculateYearlyReturn,
  quantityAtDate,
  type LocalPriceBaseline,
  type ReturnPosition,
  type ReturnResult,
} from '@/lib/returnEngine';
import { YEAR_START_2026 } from '@/data/baselines/2026-year-start';
import { MONTH_END_2026 } from '@/data/baselines/2026-month-end';

export interface PeriodPnL {
  change: number;
  changePercent: number;
}

export interface PnLStats {
  daily: PeriodPnL;
  monthly: PeriodPnL;
  yearly: PeriodPnL;
}

type PositionInput = {
  currentPrice: number;
  avgCost: number;
  quantity: number;
  accountId: string;
  symbol?: string;
  assetType?: string;
  currency?: string;
  buyDate?: string;
};

type AccountInput = { id: string; currency: string };
type PriceInput = { symbol: string; date: string; price: number; currency: string; dataTier?: string };
type TradeInput = {
  accountId: string;
  symbol: string;
  assetType: string;
  type: 'buy' | 'sell';
  quantity: number;
  executedAt: string;
};

function isWeekend(date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function currentYearStart(): string {
  return `${getBusinessDate().slice(0, 4)}-01-01`;
}

function currentMonthStart(): string {
  return `${getBusinessDate().slice(0, 7)}-01`;
}

function previousMonthKey(): string {
  const [yearText, monthText] = getBusinessDate().slice(0, 7).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function isUsablePrice(item: { price: number; dataTier?: string }): boolean {
  return item.price > 0 && item.dataTier !== 'estimate' && item.dataTier !== 'stale';
}

function latestSnapshotBefore(
  symbol: string,
  date: string,
  snapshots: PriceInput[]
): PriceInput | undefined {
  return snapshots
    .filter((item) => item.symbol.toUpperCase() === symbol.toUpperCase() && item.date < date && isUsablePrice(item))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function localMonthBaseline(symbol: string): LocalPriceBaseline | undefined {
  return MONTH_END_2026[previousMonthKey()]?.[symbol.toUpperCase()];
}

function resolveMonthlyBaseline(symbol: string, snapshots: PriceInput[]): LocalPriceBaseline | undefined {
  const local = localMonthBaseline(symbol);
  if (local) return local;
  const point = latestSnapshotBefore(symbol, currentMonthStart(), snapshots);
  return point ? { date: point.date, price: point.price, currency: point.currency } : undefined;
}

function resolveYearlyBaseline(symbol: string, snapshots: PriceInput[]): LocalPriceBaseline | undefined {
  const local = YEAR_START_2026[symbol.toUpperCase()];
  if (local) return local;
  const point = latestSnapshotBefore(symbol, currentYearStart(), snapshots);
  return point ? { date: point.date, price: point.price, currency: point.currency } : undefined;
}

function toReturnPosition(
  position: PositionInput,
  account: AccountInput | undefined,
  baseline: LocalPriceBaseline | undefined,
  previousQuantity: number | undefined,
  monthBaseline: LocalPriceBaseline | undefined,
  monthQuantity: number | undefined,
  yearBaseline: LocalPriceBaseline | undefined,
  yearQuantity: number | undefined
): ReturnPosition {
  return {
    symbol: position.symbol || '',
    assetType: position.assetType || 'stock',
    accountCurrency: account?.currency || 'CNY',
    storedCurrency: position.currency,
    currentPrice: position.currentPrice,
    currentQuantity: position.quantity,
    previousClose: baseline,
    previousQuantity,
    monthBaseline,
    monthQuantity,
    yearBaseline,
    yearQuantity,
  };
}

function resultToPeriod(result: ReturnResult): PeriodPnL {
  return { change: result.missingBaseline ? 0 : result.changeCNY, changePercent: result.missingBaseline ? 0 : result.changePercent || 0 };
}

function calculatePositionReturns(
  position: PositionInput,
  accounts: AccountInput[],
  fxRates: FxRates,
  snapshots: PriceInput[],
  trades: TradeInput[]
): PnLStats {
  const account = accounts.find((item) => item.id === position.accountId);
  const symbol = position.symbol || '';
  const previous = latestSnapshotBefore(symbol, getBusinessDate(), snapshots);
  const previousQuantity = previous
    ? quantityAtDate({ accountId: position.accountId, symbol, assetType: position.assetType || 'stock', quantity: position.quantity, buyDate: position.buyDate }, trades, previous.date)
    : undefined;
  const monthBaseline = resolveMonthlyBaseline(symbol, snapshots);
  const monthQuantity = monthBaseline
    ? quantityAtDate({ accountId: position.accountId, symbol, assetType: position.assetType || 'stock', quantity: position.quantity, buyDate: position.buyDate }, trades, monthBaseline.date)
    : undefined;
  const yearBaseline = resolveYearlyBaseline(symbol, snapshots);
  const yearQuantity = yearBaseline
    ? quantityAtDate({ accountId: position.accountId, symbol, assetType: position.assetType || 'stock', quantity: position.quantity, buyDate: position.buyDate }, trades, yearBaseline.date)
    : undefined;
  const returnPosition = toReturnPosition(position, account, previous ? { date: previous.date, price: previous.price, currency: previous.currency } : undefined, previousQuantity, monthBaseline, monthQuantity, yearBaseline, yearQuantity);

  return {
    daily: isWeekend() ? { change: 0, changePercent: 0 } : resultToPeriod(calculateDailyReturn(returnPosition, fxRates)),
    monthly: resultToPeriod(calculateMonthlyReturn(returnPosition, fxRates)),
    yearly: resultToPeriod(calculateYearlyReturn(returnPosition, fxRates)),
  };
}

function aggregatePnL(
  positions: PositionInput[],
  accounts: AccountInput[],
  fxRates: FxRates,
  snapshots: PriceInput[] = [],
  trades: TradeInput[] = []
): PnLStats {
  const totals = {
    daily: { change: 0, base: 0 },
    monthly: { change: 0, base: 0 },
    yearly: { change: 0, base: 0 },
  };

  for (const position of positions) {
    const result = calculatePositionReturns(position, accounts, fxRates, snapshots, trades);
    const account = accounts.find((item) => item.id === position.accountId);
    const currency = getPositionCurrency(position.symbol || '', position.assetType, position.currency, account?.currency || 'CNY');
    const currentValue = convertToAccountCNY(position.currentPrice * position.quantity, currency, 'CNY', fxRates);
    totals.daily.change += result.daily.change;
    totals.monthly.change += result.monthly.change;
    totals.yearly.change += result.yearly.change;
    totals.daily.base += result.daily.change !== 0 ? currentValue - result.daily.change : 0;
    totals.monthly.base += result.monthly.change !== 0 ? currentValue - result.monthly.change : 0;
    totals.yearly.base += result.yearly.change !== 0 ? currentValue - result.yearly.change : 0;
  }

  return {
    daily: { change: totals.daily.change, changePercent: totals.daily.base > 0 ? (totals.daily.change / totals.daily.base) * 100 : 0 },
    monthly: { change: totals.monthly.change, changePercent: totals.monthly.base > 0 ? (totals.monthly.change / totals.monthly.base) * 100 : 0 },
    yearly: { change: totals.yearly.change, changePercent: totals.yearly.base > 0 ? (totals.yearly.change / totals.yearly.base) * 100 : 0 },
  };
}

export function usePnLStats(): PnLStats {
  const { positions, accounts, priceSnapshots, trades } = useAppStore();
  const { rates: fxRates } = useFxRates();
  return useMemo(() => aggregatePnL(positions, accounts, fxRates, priceSnapshots, trades), [positions, accounts, fxRates, priceSnapshots, trades]);
}

export function usePositionPnL(positionId: string): PnLStats {
  const { positions, accounts, priceSnapshots, trades } = useAppStore();
  const { rates: fxRates } = useFxRates();
  return useMemo(() => {
    const position = positions.find((item) => item.id === positionId);
    if (!position) return { daily: { change: 0, changePercent: 0 }, monthly: { change: 0, changePercent: 0 }, yearly: { change: 0, changePercent: 0 } };
    return calculatePositionReturns(position, accounts, fxRates, priceSnapshots, trades);
  }, [positionId, positions, accounts, fxRates, priceSnapshots, trades]);
}

export function useAccountPnLStats(accountId: string): PnLStats {
  const { positions, accounts, priceSnapshots, trades } = useAppStore();
  const { rates: fxRates } = useFxRates();
  return useMemo(() => aggregatePnL(positions.filter((item) => item.accountId === accountId), accounts, fxRates, priceSnapshots, trades), [accountId, positions, accounts, fxRates, priceSnapshots, trades]);
}

export function computePositionPnLRaw(
  position: PositionInput,
  accounts: AccountInput[],
  fxRates: FxRates,
  priceSnapshots: PriceInput[] = [],
  trades: TradeInput[] = []
): PnLStats {
  return calculatePositionReturns(position, accounts, fxRates, priceSnapshots, trades);
}

export function computeAccountPnLRaw(
  accountId: string,
  positions: PositionInput[],
  accounts: AccountInput[],
  fxRates: FxRates,
  priceSnapshots: PriceInput[] = [],
  trades: TradeInput[] = []
): PnLStats {
  return aggregatePnL(positions.filter((item) => item.accountId === accountId), accounts, fxRates, priceSnapshots, trades);
}
