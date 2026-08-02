/**
 * Real-time P&L calculation based on period open price snapshots stored in positions.
 *
 * Logic:
 * - Each position stores dailyOpenPrice / monthlyOpenPrice / yearlyOpenPrice
 *   (populated when price is first refreshed each day/month/year)
 * - P&L = (currentPrice - openPrice) × quantity
 * - FX conversion to CNY via convertToAccountCNY
 */

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { useFxRates } from './useFxRates';
import { convertToAccountCNY, getEffectiveCurrency, type FxRates } from '@/lib/fx';

export interface PeriodPnL {
  change: number;
  changePercent: number;
}

export interface PnLStats {
  daily: PeriodPnL;
  monthly: PeriodPnL;
  yearly: PeriodPnL;
}

function isWeekend(date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getPeriodStart(period: 'monthly' | 'yearly'): string {
  const today = new Date();
  if (period === 'monthly') return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  return `${today.getFullYear()}-01-01`;
}

function findBaselinePrice(
  symbol: string | undefined,
  period: 'monthly' | 'yearly',
  snapshots: { symbol: string; date: string; price: number; dataTier?: string }[]
): number | undefined {
  if (!symbol) return undefined;
  const start = getPeriodStart(period);
  return snapshots
    .filter((item) => item.symbol.toUpperCase() === symbol.toUpperCase() && item.date < start && item.price > 0 && item.dataTier !== 'estimate' && item.dataTier !== 'stale')
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.price;
}

// Compute P&L for a single position (returns flat numbers, no FX)
function computePositionPnL(
  pos: { currentPrice: number; symbol?: string; dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number; quantity: number; avgCost: number }
): { daily: number; monthly: number; yearly: number; dailyPercent: number; monthlyPercent: number; yearlyPercent: number } {
  const weekend = isWeekend();
  const daily = weekend ? 0 : pos.dailyBasePrice != null
    ? (pos.currentPrice - pos.dailyBasePrice) * pos.quantity
    : 0;
  const monthly = pos.monthlyBasePrice != null
    ? (pos.currentPrice - pos.monthlyBasePrice) * pos.quantity
    : 0;
  const yearly = pos.yearlyBasePrice != null
    ? (pos.currentPrice - pos.yearlyBasePrice) * pos.quantity
    : 0;

  // Percent vs baseline price
  const dailyPercent = weekend ? 0 : pos.dailyBasePrice ? ((pos.currentPrice - pos.dailyBasePrice) / pos.dailyBasePrice) * 100 : 0;
  const monthlyPercent = pos.monthlyBasePrice ? ((pos.currentPrice - pos.monthlyBasePrice) / pos.monthlyBasePrice) * 100 : 0;
  const yearlyPercent = pos.yearlyBasePrice ? ((pos.currentPrice - pos.yearlyBasePrice) / pos.yearlyBasePrice) * 100 : 0;

  return { daily, monthly, yearly, dailyPercent, monthlyPercent, yearlyPercent };
}

// Aggregate P&L across positions (with FX conversion)
function aggregatePnL(
  positions: { currentPrice: number; symbol?: string; avgCost: number; quantity: number; accountId: string; currency?: string;
    dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number }[],
  accounts: { id: string; currency: string }[],
  fxRates: FxRates,
  priceSnapshots: { symbol: string; date: string; price: number; dataTier?: string }[] = []
) {
  let dailyCNY = 0, monthlyCNY = 0, yearlyCNY = 0;
  let dailyBase = 0, monthlyBase = 0, yearlyBase = 0;
  const weekend = isWeekend();

  for (const pos of positions) {
    const account = accounts.find(a => a.id === pos.accountId);
    const acctCcy = account?.currency || 'CNY';
    const posCcy = getEffectiveCurrency(pos.currency, acctCcy, (pos as { symbol?: string }).symbol, (pos as { assetType?: string }).assetType);

    // Current total value in CNY
    const curValue = convertToAccountCNY(pos.currentPrice * pos.quantity, posCcy, 'CNY', fxRates);
    dailyBase += curValue;
    monthlyBase += curValue;
    yearlyBase += curValue;

    // Baseline values in CNY
    const dailyBaseVal = weekend
      ? curValue
      : pos.dailyBasePrice != null
        ? convertToAccountCNY(pos.dailyBasePrice * pos.quantity, posCcy, 'CNY', fxRates)
        : curValue;
    const monthlyBaseline = findBaselinePrice(pos.symbol, 'monthly', priceSnapshots) ?? pos.monthlyBasePrice;
    const yearlyBaseline = findBaselinePrice(pos.symbol, 'yearly', priceSnapshots) ?? pos.yearlyBasePrice;
    const monthlyBaseVal = monthlyBaseline != null
      ? convertToAccountCNY(monthlyBaseline * pos.quantity, posCcy, 'CNY', fxRates)
      : curValue;
    const yearlyBaseVal = yearlyBaseline != null
      ? convertToAccountCNY(yearlyBaseline * pos.quantity, posCcy, 'CNY', fxRates)
      : curValue;

    dailyCNY += dailyBaseVal;
    monthlyCNY += monthlyBaseVal;
    yearlyCNY += yearlyBaseVal;
  }

  const calcChange = (current: number, baseVal: number): PeriodPnL => {
    const change = current - baseVal;
    const percent = baseVal > 0 ? (change / baseVal) * 100 : 0;
    return { change, changePercent: percent };
  };

  return {
    daily: weekend ? { change: 0, changePercent: 0 } : calcChange(dailyBase, dailyCNY),
    monthly: calcChange(monthlyBase, monthlyCNY),
    yearly: calcChange(yearlyBase, yearlyCNY),
  };
}

// ── Public hooks ──────────────────────────────────────────────────────────────

/** Overall P&L across all positions (in CNY) */
export function usePnLStats(): PnLStats {
  const { positions, accounts, priceSnapshots } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(
    () => aggregatePnL(positions, accounts, fxRates, priceSnapshots),
    [positions, accounts, fxRates, priceSnapshots]
  );
}

/** P&L for a single position (in account currency) */
export function usePositionPnL(positionId: string): PnLStats {
  const { positions } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(() => {
    const pos = positions.find(p => p.id === positionId);
    if (!pos) return { daily: { change: 0, changePercent: 0 }, monthly: { change: 0, changePercent: 0 }, yearly: { change: 0, changePercent: 0 } };
    const pnl = computePositionPnL(pos);
    return {
      daily: { change: pnl.daily, changePercent: pnl.dailyPercent },
      monthly: { change: pnl.monthly, changePercent: pnl.monthlyPercent },
      yearly: { change: pnl.yearly, changePercent: pnl.yearlyPercent },
    };
  }, [positionId, positions, fxRates]);
}

/** P&L for positions belonging to a specific account */
export function useAccountPnLStats(accountId: string): PnLStats {
  const { positions, accounts, priceSnapshots } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(() => {
    const filtered = positions.filter(p => p.accountId === accountId);
    return aggregatePnL(filtered, accounts, fxRates, priceSnapshots);
  }, [accountId, positions, accounts, fxRates]);
}

// ── Pure computation variants (no hooks, safe inside forEach/map) ──────────────

/** Pure P&L for a single position (no FX) */
export function computePositionPnLRaw(
  pos: { currentPrice: number; avgCost: number; quantity: number; accountId: string; symbol?: string; currency?: string;
    dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number },
  accounts: { id: string; currency: string }[],
  fxRates: FxRates
): PnLStats {
  const account = accounts.find(a => a.id === pos.accountId);
  const acctCcy = account?.currency || 'CNY';
  const posCcy = getEffectiveCurrency(pos.currency, acctCcy, (pos as { symbol?: string }).symbol);

  const daily = pos.dailyBasePrice != null
    ? convertToAccountCNY((pos.currentPrice - pos.dailyBasePrice) * pos.quantity, posCcy, 'CNY', fxRates)
    : 0;
  const monthly = pos.monthlyBasePrice != null
    ? convertToAccountCNY((pos.currentPrice - pos.monthlyBasePrice) * pos.quantity, posCcy, 'CNY', fxRates)
    : 0;
  const yearly = pos.yearlyBasePrice != null
    ? convertToAccountCNY((pos.currentPrice - pos.yearlyBasePrice) * pos.quantity, posCcy, 'CNY', fxRates)
    : 0;

  const dailyPercent = pos.dailyBasePrice ? ((pos.currentPrice - pos.dailyBasePrice) / pos.dailyBasePrice) * 100 : 0;
  const monthlyPercent = pos.monthlyBasePrice ? ((pos.currentPrice - pos.monthlyBasePrice) / pos.monthlyBasePrice) * 100 : 0;
  const yearlyPercent = pos.yearlyBasePrice ? ((pos.currentPrice - pos.yearlyBasePrice) / pos.yearlyBasePrice) * 100 : 0;

  return {
    daily: { change: daily, changePercent: dailyPercent },
    monthly: { change: monthly, changePercent: monthlyPercent },
    yearly: { change: yearly, changePercent: yearlyPercent },
  };
}

/** Pure account P&L aggregation (no hooks) */
export function computeAccountPnLRaw(
  accountId: string,
  positions: { currentPrice: number; avgCost: number; quantity: number; accountId: string; currency?: string;
    dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number }[],
  accounts: { id: string; currency: string }[],
  fxRates: FxRates,
  priceSnapshots: { symbol: string; date: string; price: number; dataTier?: string }[] = []
): PnLStats {
  const filtered = positions.filter(p => p.accountId === accountId);
  return aggregatePnL(filtered, accounts, fxRates, priceSnapshots);
}
