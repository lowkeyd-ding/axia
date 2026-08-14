import type { Account, Position, Snapshot, Trade, Transfer, PositionValue } from '@/types';
import { convertToAccountCNY, getPositionCurrency, type FxRates } from '@/lib/fx';
import { YEAR_START_2026 } from '@/data/baselines/2026-year-start';
import { MONTH_END_2026 } from '@/data/baselines/2026-month-end';
import { quantityAtDate } from '@/lib/returnEngine';

export interface MonthEndSnapshotInput {
  date: string;
  accounts: Account[];
  positions: Position[];
  trades: Trade[];
  transfers: Transfer[];
  fxRates: FxRates;
  priceSnapshots: { symbol: string; date: string; price: number; currency: string; dataTier?: string }[];
}

export interface MonthEndSnapshotResult {
  date: string;
  totalValue: number;
  cash: number;
  investments: number;
  dailyChange: number;
  dailyChangePercent: number;
  totalChange: number;
  totalChangePercent: number;
  allocations: Snapshot['allocations'];
  accountValues: Snapshot['accountValues'];
  positionValues: PositionValue[];
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function previousMonthKey(date: string): string {
  const [yearText, monthText] = monthKey(date).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthEndDate(date: string): string {
  const start = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  const nextMonth = new Date(start);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(0);
  return nextMonth.toISOString().slice(0, 10);
}

function latestKnownPrice(symbol: string, date: string, priceSnapshots: MonthEndSnapshotInput['priceSnapshots']): { price: number; currency: string } | null {
  const monthBaseline = MONTH_END_2026[monthKey(date)]?.[symbol.toUpperCase()];
  if (monthBaseline) return { price: monthBaseline.price, currency: monthBaseline.currency };

  const previousMonthBaseline = MONTH_END_2026[previousMonthKey(date)]?.[symbol.toUpperCase()];
  if (previousMonthBaseline) return { price: previousMonthBaseline.price, currency: previousMonthBaseline.currency };

  const localYear = YEAR_START_2026[symbol.toUpperCase()];
  if (localYear) return { price: localYear.price, currency: localYear.currency };

  const fromSnapshots = [...priceSnapshots]
    .filter((item) => item.symbol.toUpperCase() === symbol.toUpperCase() && item.date <= date && item.price > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return fromSnapshots ? { price: fromSnapshots.price, currency: fromSnapshots.currency } : null;
}

function toTradeInputs(trades: Trade[]): { accountId: string; symbol: string; assetType: string; type: 'buy' | 'sell'; quantity: number; executedAt: string }[] {
  return trades.map((trade) => ({
    accountId: trade.accountId,
    symbol: trade.symbol,
    assetType: trade.assetType,
    type: trade.type,
    quantity: trade.quantity,
    executedAt: trade.executedAt,
  }));
}

export function buildMonthEndSnapshot(input: MonthEndSnapshotInput): MonthEndSnapshotResult | null {
  const monthEndDate = getMonthEndDate(input.date);
  const totalValueByAccount = new Map<string, { cash: number; investments: number }>();
  const allocationMap = new Map<string, number>([
    ['stock', 0],
    ['fund', 0],
    ['bank_wealth_management', 0],
    ['bank_cash', 0],
  ]);
  let totalCash = 0;
  let totalInvestments = 0;
  let totalValue = 0;
  const positionValues: PositionValue[] = [];
  const tradeInputs = toTradeInputs(input.trades);

  for (const account of input.accounts) {
    const acctCcy = account.currency || 'CNY';
    const cashValue = convertToAccountCNY(account.balance, acctCcy, 'CNY', input.fxRates);
    let investments = 0;

    const accountPositions = input.positions.filter((pos) => pos.accountId === account.id);

    for (const position of accountPositions) {
      const currency = getPositionCurrency(position.symbol, position.assetType, position.currency, acctCcy);
      const quantity = quantityAtDate(
        {
          accountId: position.accountId,
          symbol: position.symbol,
          assetType: position.assetType,
          quantity: position.quantity,
          buyDate: position.buyDate,
        },
        tradeInputs,
        monthEndDate
      );
      const baseline = latestKnownPrice(position.symbol, monthEndDate, input.priceSnapshots);
      if (!baseline || quantity <= 0) continue;
      const value = convertToAccountCNY(baseline.price * quantity, currency, 'CNY', input.fxRates);
      const costBasis = convertToAccountCNY(position.avgCost * quantity, currency, 'CNY', input.fxRates);
      const pnl = value - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      investments += value;
      totalInvestments += value;
      allocationMap.set(position.assetType, (allocationMap.get(position.assetType) || 0) + value);
      positionValues.push({
        positionId: position.id,
        symbol: position.symbol,
        name: position.name,
        assetType: position.assetType,
        quantity,
        avgCost: position.avgCost,
        currentPrice: baseline.price,
        value,
        pnl,
        pnlPercent,
      });
    }

    totalCash += cashValue;
    totalValue += cashValue + investments;
    totalValueByAccount.set(account.id, { cash: cashValue, investments });
  }

  const accountValues = input.accounts.map((account) => {
    const values = totalValueByAccount.get(account.id) || { cash: 0, investments: 0 };
    return {
      accountId: account.id,
      accountName: account.name,
      currency: account.currency,
      value: values.cash + values.investments,
      cash: values.cash,
      investments: values.investments,
    };
  });

  const allocations = Array.from(allocationMap.entries())
    .filter(([, value]) => value > 0)
    .map(([type, value]) => ({
      type: type as Snapshot['allocations'][number]['type'],
      value,
      percentage: totalInvestments > 0 ? (value / totalInvestments) * 100 : 0,
    }));

  return {
    date: monthEndDate,
    totalValue,
    cash: totalCash,
    investments: totalInvestments,
    dailyChange: 0,
    dailyChangePercent: 0,
    totalChange: 0,
    totalChangePercent: 0,
    allocations,
    accountValues,
    positionValues,
  };
}

export function listMonthEndDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);

  const cursor = new Date(start);
  while (cursor <= end) {
    const monthEnd = getMonthEndDate(cursor.toISOString().slice(0, 10));
    if (monthEnd >= startDate && monthEnd <= endDate) dates.push(monthEnd);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return Array.from(new Set(dates));
}

export function buildMissingMonthEndSnapshots(input: MonthEndSnapshotInput, startDate: string, existingDates: Set<string>): Snapshot[] {
  const dates = listMonthEndDates(startDate, input.date);
  return dates
    .filter((date) => !existingDates.has(date))
    .map((date) => {
      const result = buildMonthEndSnapshot({ ...input, date });
      if (!result) return null;
      return {
        id: `${date}-month-end-auto`,
        date: result.date,
        totalValue: result.totalValue,
        cash: result.cash,
        investments: result.investments,
        dailyChange: result.dailyChange,
        dailyChangePercent: result.dailyChangePercent,
        totalChange: result.totalChange,
        totalChangePercent: result.totalChangePercent,
        allocations: result.allocations,
        accountValues: result.accountValues,
        positionValues: result.positionValues,
        note: '月末自动补全快照',
        createdAt: new Date().toISOString(),
      } as Snapshot;
    })
    .filter((item): item is Snapshot => item != null);
}
