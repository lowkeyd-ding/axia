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

// Compute P&L for a single position (returns flat numbers, no FX)
function computePositionPnL(
  pos: { currentPrice: number; dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number; quantity: number; avgCost: number }
): { daily: number; monthly: number; yearly: number; dailyPercent: number; monthlyPercent: number; yearlyPercent: number } {
  const daily = pos.dailyBasePrice != null
    ? (pos.currentPrice - pos.dailyBasePrice) * pos.quantity
    : 0;
  const monthly = pos.monthlyBasePrice != null
    ? (pos.currentPrice - pos.monthlyBasePrice) * pos.quantity
    : 0;
  const yearly = pos.yearlyBasePrice != null
    ? (pos.currentPrice - pos.yearlyBasePrice) * pos.quantity
    : 0;

  // Percent vs baseline price
  const dailyPercent = pos.dailyBasePrice ? ((pos.currentPrice - pos.dailyBasePrice) / pos.dailyBasePrice) * 100 : 0;
  const monthlyPercent = pos.monthlyBasePrice ? ((pos.currentPrice - pos.monthlyBasePrice) / pos.monthlyBasePrice) * 100 : 0;
  const yearlyPercent = pos.yearlyBasePrice ? ((pos.currentPrice - pos.yearlyBasePrice) / pos.yearlyBasePrice) * 100 : 0;

  return { daily, monthly, yearly, dailyPercent, monthlyPercent, yearlyPercent };
}

// Aggregate P&L across positions (with FX conversion)
function aggregatePnL(
  positions: { currentPrice: number; avgCost: number; quantity: number; accountId: string; currency?: string;
    dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number }[],
  accounts: { id: string; currency: string }[],
  fxRates: FxRates
) {
  let dailyCNY = 0, monthlyCNY = 0, yearlyCNY = 0;
  let dailyBase = 0, monthlyBase = 0, yearlyBase = 0;

  for (const pos of positions) {
    const account = accounts.find(a => a.id === pos.accountId);
    const acctCcy = account?.currency || 'CNY';
    const posCcy = getEffectiveCurrency(pos.currency, acctCcy);

    // Current total value in CNY
    const curValue = convertToAccountCNY(pos.currentPrice * pos.quantity, posCcy, 'CNY', fxRates);
    dailyBase += curValue;
    monthlyBase += curValue;
    yearlyBase += curValue;

    // Baseline values in CNY
    const dailyBaseVal = pos.dailyBasePrice != null
      ? convertToAccountCNY(pos.dailyBasePrice * pos.quantity, posCcy, 'CNY', fxRates)
      : curValue;
    const monthlyBaseVal = pos.monthlyBasePrice != null
      ? convertToAccountCNY(pos.monthlyBasePrice * pos.quantity, posCcy, 'CNY', fxRates)
      : curValue;
    const yearlyBaseVal = pos.yearlyBasePrice != null
      ? convertToAccountCNY(pos.yearlyBasePrice * pos.quantity, posCcy, 'CNY', fxRates)
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
    daily: calcChange(dailyBase, dailyCNY),
    monthly: calcChange(monthlyBase, monthlyCNY),
    yearly: calcChange(yearlyBase, yearlyCNY),
  };
}

// ── Public hooks ──────────────────────────────────────────────────────────────

/** Overall P&L across all positions (in CNY) */
export function usePnLStats(): PnLStats {
  const { positions, accounts } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(
    () => aggregatePnL(positions, accounts, fxRates),
    [positions, accounts, fxRates]
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
  const { positions, accounts } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(() => {
    const filtered = positions.filter(p => p.accountId === accountId);
    return aggregatePnL(filtered, accounts, fxRates);
  }, [accountId, positions, accounts, fxRates]);
}

// ── Pure computation variants (no hooks, safe inside forEach/map) ──────────────

/** Pure P&L for a single position (no FX) */
export function computePositionPnLRaw(
  pos: { currentPrice: number; avgCost: number; quantity: number; accountId: string; currency?: string;
    dailyBasePrice?: number; monthlyBasePrice?: number; yearlyBasePrice?: number },
  accounts: { id: string; currency: string }[],
  fxRates: FxRates
): PnLStats {
  const account = accounts.find(a => a.id === pos.accountId);
  const acctCcy = account?.currency || 'CNY';
  const posCcy = getEffectiveCurrency(pos.currency, acctCcy);

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
  fxRates: FxRates
): PnLStats {
  const filtered = positions.filter(p => p.accountId === accountId);
  return aggregatePnL(filtered, accounts, fxRates);
}
