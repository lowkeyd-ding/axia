'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { useFxRates } from './useFxRates';
import { convertToAccountCNY, getEffectiveCurrency, type FxRates } from '@/lib/fx';
import type { Snapshot, Position, Account } from '@/types';

export interface PnLStats {
  daily: { change: number; changePercent: number };
  monthly: { change: number; changePercent: number };
  yearly: { change: number; changePercent: number };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function usePnLStats(): PnLStats {
  const { snapshots, accounts, positions } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(() => {
    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (sorted.length === 0) {
      return {
        daily: { change: 0, changePercent: 0 },
        monthly: { change: 0, changePercent: 0 },
        yearly: { change: 0, changePercent: 0 },
      };
    }

    const today = startOfDay(new Date());
    const monthStart = startOfMonth(new Date());
    const yearStart = startOfYear(new Date());

    // Find snapshots at or before each period boundary
    const findSnapshotOnOrBefore = (snapshots: typeof sorted, boundary: Date) => {
      let result: typeof sorted[0] | null = null;
      for (const s of snapshots) {
        if (new Date(s.date) <= boundary) {
          result = s;
        } else {
          break;
        }
      }
      return result;
    };

    const todaySnapshot = findSnapshotOnOrBefore(sorted, today);
    const monthStartSnapshot = findSnapshotOnOrBefore(sorted, monthStart);
    const yearStartSnapshot = findSnapshotOnOrBefore(sorted, yearStart);

    // Get previous snapshots (for daily we need yesterday's, for others we need the snapshot just before boundary)
    const findPrevSnapshot = (snapshots: typeof sorted, boundary: Date) => {
      let prev: typeof sorted[0] | null = null;
      for (const s of snapshots) {
        if (new Date(s.date) < boundary) {
          prev = s;
        } else {
          break;
        }
      }
      return prev;
    };

    const yesterdaySnapshot = findPrevSnapshot(sorted, today);
    const prevMonthSnapshot = findPrevSnapshot(sorted, monthStart);
    const prevYearSnapshot = findPrevSnapshot(sorted, yearStart);

    const calcChange = (current: typeof sorted[0] | null, prev: typeof sorted[0] | null) => {
      if (!current) return { change: 0, changePercent: 0 };
      const base = prev?.totalValue ?? current.totalValue;
      const change = current.totalValue - base;
      const changePercent = base > 0 ? (change / base) * 100 : 0;
      return { change, changePercent };
    };

    return {
      daily: calcChange(todaySnapshot, yesterdaySnapshot),
      monthly: calcChange(todaySnapshot, prevMonthSnapshot),
      yearly: calcChange(todaySnapshot, prevYearSnapshot),
    };
  }, [snapshots, accounts, positions, fxRates]);
}

// Per-account P&L stats
export function useAccountPnLStats(accountId: string) {
  const { snapshots, accounts, positions } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(() => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return {
        daily: { change: 0, changePercent: 0 },
        monthly: { change: 0, changePercent: 0 },
        yearly: { change: 0, changePercent: 0 },
      };
    }

    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const today = startOfDay(new Date());
    const monthStart = startOfMonth(new Date());
    const yearStart = startOfYear(new Date());

    const findSnapshotOnOrBefore = (snapshots: typeof sorted, boundary: Date) => {
      let result: typeof sorted[0] | null = null;
      for (const s of snapshots) {
        if (new Date(s.date) <= boundary) result = s;
        else break;
      }
      return result;
    };

    const findPrevSnapshot = (snapshots: typeof sorted, boundary: Date) => {
      let prev: typeof sorted[0] | null = null;
      for (const s of snapshots) {
        if (new Date(s.date) < boundary) prev = s;
        else break;
      }
      return prev;
    };

    const calcChange = (
      current: typeof sorted[0] | null,
      prev: typeof sorted[0] | null
    ) => {
      if (!current) return { change: 0, changePercent: 0 };
      const getAcctValue = (s: typeof sorted[0]) => {
        const av = s.accountValues.find((av) => av.accountId === accountId);
        return av?.value ?? 0;
      };
      const base = prev ? getAcctValue(prev) : getAcctValue(current);
      const change = getAcctValue(current) - base;
      const changePercent = base > 0 ? (change / base) * 100 : 0;
      return { change, changePercent };
    };

    const todaySnapshot = findSnapshotOnOrBefore(sorted, today);
    const prevMonthSnapshot = findPrevSnapshot(sorted, monthStart);
    const prevYearSnapshot = findPrevSnapshot(sorted, yearStart);

    return {
      daily: calcChange(todaySnapshot, findPrevSnapshot(sorted, today)),
      monthly: calcChange(todaySnapshot, prevMonthSnapshot),
      yearly: calcChange(todaySnapshot, prevYearSnapshot),
    };
  }, [accountId, snapshots, accounts, positions, fxRates]);
}

// Pure computation — no hooks, safe to call inside forEach/map
export function computePositionPnL(
  positionId: string,
  snapshots: Snapshot[],
  positions: Position[],
  fxRates: FxRates
) {
  const position = positions.find((p) => p.id === positionId);
  if (!position) return { daily: 0, monthly: 0, yearly: 0 };

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  if (sorted.length === 0) return { daily: 0, monthly: 0, yearly: 0 };

  const getPosValue = (s: Snapshot) => {
    const pv = s.positionValues.find((pv) => pv.positionId === positionId);
    if (!pv) return 0;
    const acct = useAppStore.getState().accounts.find((a) => a.id === position.accountId);
    const acctCcy = acct?.currency || 'CNY';
    const posCcy = getEffectiveCurrency(position.currency, acctCcy);
    return convertToAccountCNY(pv.value, posCcy, 'CNY', fxRates);
  };

  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());
  const yearStart = startOfYear(new Date());

  const findSnapshotOnOrBefore = (snapshots: Snapshot[], boundary: Date) => {
    let result: Snapshot | null = null;
    for (const s of snapshots) {
      if (new Date(s.date) <= boundary) result = s;
      else break;
    }
    return result;
  };

  const findPrevSnapshot = (snapshots: Snapshot[], boundary: Date) => {
    let prev: Snapshot | null = null;
    for (const s of snapshots) {
      if (new Date(s.date) < boundary) prev = s;
      else break;
    }
    return prev;
  };

  const todaySnapshot = findSnapshotOnOrBefore(sorted, today);
  const prevMonthSnapshot = findPrevSnapshot(sorted, monthStart);
  const prevYearSnapshot = findPrevSnapshot(sorted, yearStart);

  const getChange = (current: Snapshot | null, prev: Snapshot | null) => {
    if (!current) return 0;
    const base = prev ? getPosValue(prev) : getPosValue(current);
    return getPosValue(current) - base;
  };

  return {
    daily: getChange(todaySnapshot, findPrevSnapshot(sorted, today)),
    monthly: getChange(todaySnapshot, prevMonthSnapshot),
    yearly: getChange(todaySnapshot, prevYearSnapshot),
  };
}

// Pure computation — no hooks, safe to call inside forEach/map
export function computeAccountPnL(
  accountId: string,
  snapshots: Snapshot[],
  accounts: Account[],
  positions: Position[],
  fxRates: FxRates
) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { daily: { change: 0, changePercent: 0 }, monthly: { change: 0, changePercent: 0 }, yearly: { change: 0, changePercent: 0 } };

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  if (sorted.length === 0) {
    return { daily: { change: 0, changePercent: 0 }, monthly: { change: 0, changePercent: 0 }, yearly: { change: 0, changePercent: 0 } };
  }

  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());
  const yearStart = startOfYear(new Date());

  const findSnapshotOnOrBefore = (snapshots: Snapshot[], boundary: Date) => {
    let result: Snapshot | null = null;
    for (const s of snapshots) {
      if (new Date(s.date) <= boundary) result = s;
      else break;
    }
    return result;
  };

  const findPrevSnapshot = (snapshots: Snapshot[], boundary: Date) => {
    let prev: Snapshot | null = null;
    for (const s of snapshots) {
      if (new Date(s.date) < boundary) prev = s;
      else break;
    }
    return prev;
  };

  const getAcctValue = (s: Snapshot) => {
    const av = s.accountValues.find((av) => av.accountId === accountId);
    return av?.value ?? 0;
  };

  const calcChange = (current: Snapshot | null, prev: Snapshot | null) => {
    if (!current) return { change: 0, changePercent: 0 };
    const base = prev ? getAcctValue(prev) : getAcctValue(current);
    const change = getAcctValue(current) - base;
    const changePercent = base > 0 ? (change / base) * 100 : 0;
    return { change, changePercent };
  };

  const todaySnapshot = findSnapshotOnOrBefore(sorted, today);
  const prevMonthSnapshot = findPrevSnapshot(sorted, monthStart);
  const prevYearSnapshot = findPrevSnapshot(sorted, yearStart);

  return {
    daily: calcChange(todaySnapshot, findPrevSnapshot(sorted, today)),
    monthly: calcChange(todaySnapshot, prevMonthSnapshot),
    yearly: calcChange(todaySnapshot, prevYearSnapshot),
  };
}

// Hook wrapper for components that use hooks
export function usePositionPnL(positionId: string) {
  const { snapshots, positions } = useAppStore();
  const { rates: fxRates } = useFxRates();

  return useMemo(
    () => computePositionPnL(positionId, snapshots, positions, fxRates),
    [positionId, snapshots, positions, fxRates]
  );
}
