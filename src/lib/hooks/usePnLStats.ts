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
  const latestTradeDate = trades
    .filter((trade) => trade.accountId === position.accountId && trade.symbol.toUpperCase() === symbol.toUpperCase())
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt))[0]?.executedAt.slice(0, 10);
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
  const baselinePoint = previous ? { date: previous.date, price: previous.price, currency: previous.currency } : undefined;
  const returnPosition = toReturnPosition(position, account, baselinePoint, previousQuantity, monthBaseline, monthQuantity, yearBaseline, yearQuantity);
  const stalePosition = position.buyDate && latestTradeDate && position.buyDate.slice(0, 10) < latestTradeDate && position.quantity <= 0;

  return {
    daily: isWeekend() || stalePosition ? { change: 0, changePercent: 0 } : resultToPeriod(calculateDailyReturn(returnPosition, fxRates)),
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
  let dailyChange = 0;
  let monthlyChange = 0;
  let yearlyChange = 0;
  let dailyBase = 0;
  let monthlyBase = 0;
  let yearlyBase = 0;

  for (const position of positions) {
    const result = calculatePositionReturns(position, accounts, fxRates, snapshots, trades);
    const account = accounts.find((item) => item.id === position.accountId);
    const currency = getPositionCurrency(position.symbol || '', position.assetType, position.currency, account?.currency || 'CNY');
    const currentValue = convertToAccountCNY(position.currentPrice * position.quantity, currency, 'CNY', fxRates);
    dailyChange += result.daily.change;
    monthlyChange += result.monthly.change;
    yearlyChange += result.yearly.change;
    dailyBase += currentValue - result.daily.change;
    monthlyBase += currentValue - result.monthly.change;
    yearlyBase += currentValue - result.yearly.change;
  }

  return {
    daily: { change: dailyChange, changePercent: dailyBase > 0 ? (dailyChange / dailyBase) * 100 : 0 },
    monthly: { change: monthlyChange, changePercent: monthlyBase > 0 ? (monthlyChange / monthlyBase) * 100 : 0 },
    yearly: { change: yearlyChange, changePercent: yearlyBase > 0 ? (yearlyChange / yearlyBase) * 100 : 0 },
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
