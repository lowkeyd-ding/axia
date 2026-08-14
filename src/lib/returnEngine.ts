import type { FxRates } from '@/lib/fx';
import { convertToAccountCNY, getPositionCurrency } from '@/lib/fx';

export interface LocalPriceBaseline {
  date: string;
  price: number;
  currency: string;
}

export interface PositionSnapshotPoint {
  symbol: string;
  assetType: string;
  accountId: string;
  quantity: number;
  price: number;
  currency: string;
  date: string;
}

export interface ReturnPosition {
  symbol: string;
  assetType: string;
  accountCurrency: string;
  storedCurrency?: string;
  currentPrice: number;
  currentQuantity: number;
  previousClose?: LocalPriceBaseline;
  previousQuantity?: number;
  monthBaseline?: LocalPriceBaseline;
  monthQuantity?: number;
  yearBaseline?: LocalPriceBaseline;
  yearQuantity?: number;
}

export interface ReturnResult {
  currentValueCNY: number;
  baseValueCNY: number;
  changeCNY: number;
  changePercent: number | null;
  missingBaseline: boolean;
}

function fallbackRates(): FxRates {
  return { HKD: 1, USD: 1, EUR: 1, JPY: 1, GBP: 1 } as FxRates;
}

function marketCurrency(position: ReturnPosition): string {
  return getPositionCurrency(position.symbol, position.assetType, position.storedCurrency, position.accountCurrency);
}

function calculate(position: ReturnPosition, baseline?: LocalPriceBaseline, quantity?: number, fxRates?: FxRates): ReturnResult {
  if (!baseline || !quantity || baseline.price <= 0) {
    return { currentValueCNY: 0, baseValueCNY: 0, changeCNY: 0, changePercent: null, missingBaseline: true };
  }
  const currency = marketCurrency(position);
  const rates = fxRates || fallbackRates();
  const currentValue = convertToAccountCNY(position.currentPrice * quantity, currency, 'CNY', rates);
  const baseValue = convertToAccountCNY(baseline.price * quantity, currency, 'CNY', rates);
  const change = currentValue - baseValue;
  return {
    currentValueCNY: currentValue,
    baseValueCNY: baseValue,
    changeCNY: change,
    changePercent: baseValue > 0 ? (change / baseValue) * 100 : null,
    missingBaseline: false,
  };
}

export function calculateDailyReturn(position: ReturnPosition, fxRates: FxRates): ReturnResult {
  return calculate(position, position.previousClose, position.previousQuantity, fxRates);
}

export function calculateMonthlyReturn(position: ReturnPosition, fxRates: FxRates): ReturnResult {
  return calculate(position, position.monthBaseline, position.monthQuantity, fxRates);
}

export function calculateYearlyReturn(position: ReturnPosition, fxRates: FxRates): ReturnResult {
  return calculate(position, position.yearBaseline, position.yearQuantity, fxRates);
}

export function derivePriorSnapshot(
  symbol: string,
  date: string,
  snapshots: PositionSnapshotPoint[]
): PositionSnapshotPoint | undefined {
  return snapshots
    .filter((item) => item.symbol.toUpperCase() === symbol.toUpperCase() && item.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function quantityAtDate(
  position: { id?: string; accountId: string; symbol: string; assetType: string; quantity: number; buyDate?: string },
  trades: { accountId: string; symbol: string; assetType: string; type: 'buy' | 'sell'; quantity: number; executedAt: string }[],
  date: string
): number {
  const matchingTrades = trades.filter((trade) => (
    trade.accountId === position.accountId &&
    trade.symbol.toUpperCase() === position.symbol.toUpperCase() &&
    trade.assetType === position.assetType &&
    trade.executedAt.slice(0, 10) <= date
  ));

  if (matchingTrades.length > 0) {
    return matchingTrades.reduce((quantity, trade) => (
      quantity + (trade.type === 'buy' ? trade.quantity : -trade.quantity)
    ), 0);
  }

  return position.buyDate && position.buyDate.slice(0, 10) <= date ? position.quantity : 0;
}
