import type { Snapshot, Transfer } from '@/types';
import { computeStrictPerformance } from '@/lib/domain/performance';
import { createMoney } from '@/lib/domain/money';

export interface CashFlowAdjustedPerformanceResult {
  cumulativeReturn: number;
  cumulativeReturnPercent: number | null;
  periods: number;
  isReliable: boolean;
}

export interface AdvancedPerformanceResult {
  twrPercent: number | null;
  xirrPercent: number | null;
  periods: number;
  complete: boolean;
  issues: string[];
}

function normalizeSnapshots(snapshots: Snapshot[]) {
  return [...snapshots].sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

const isExternalInflow = (t: Transfer) => t.fromAccountId === 'external' && t.toAccountId !== 'external';
const isExternalOutflow = (t: Transfer) => t.toAccountId === 'external' && t.fromAccountId !== 'external';

function cashFlowBetween(startDate: string, endDate: string, transfers: Transfer[]) {
  return transfers.reduce((sum, t) => {
    const date = t.createdAt.slice(0, 10);
    if (date <= startDate || date > endDate) return sum;
    if (isExternalInflow(t)) return sum + t.amount;
    if (isExternalOutflow(t)) return sum - t.amount;
    return sum;
  }, 0);
}

function externalCashFlows(transfers: Transfer[]) {
  return transfers.flatMap((transfer) => {
    if (isExternalInflow(transfer)) return [{ date: transfer.createdAt.slice(0, 10), amount: -transfer.amount }];
    if (isExternalOutflow(transfer)) return [{ date: transfer.createdAt.slice(0, 10), amount: transfer.amount }];
    return [];
  });
}

export function computeTimeWeightedReturn(snapshots: Snapshot[], transfers: Transfer[]): number | null {
  const ordered = normalizeSnapshots(snapshots);
  if (ordered.length < 2) return null;
  let growth = 1;
  for (let index = 1; index < ordered.length; index += 1) {
    const start = ordered[index - 1];
    const end = ordered[index];
    if (start.totalValue <= 0 || start.date >= end.date) return null;
    const flow = cashFlowBetween(start.date, end.date, transfers);
    const periodReturn = (end.totalValue - flow) / start.totalValue - 1;
    if (!Number.isFinite(periodReturn) || periodReturn <= -1) return null;
    growth *= 1 + periodReturn;
  }
  return (growth - 1) * 100;
}

function xnpv(rate: number, flows: Array<{ date: string; amount: number }>): number {
  const start = new Date(`${flows[0].date}T00:00:00.000Z`).getTime();
  return flows.reduce((sum, flow) => {
    const years = (new Date(`${flow.date}T00:00:00.000Z`).getTime() - start) / (365 * 86_400_000);
    return sum + flow.amount / ((1 + rate) ** years);
  }, 0);
}

export function computeXirr(snapshots: Snapshot[], transfers: Transfer[]): number | null {
  const ordered = normalizeSnapshots(snapshots);
  if (ordered.length < 2) return null;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first.totalValue <= 0 || last.date <= first.date) return null;
  const flows = [
    { date: first.date, amount: -first.totalValue },
    ...externalCashFlows(transfers).filter((flow) => flow.date > first.date && flow.date <= last.date),
    { date: last.date, amount: last.totalValue },
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!flows.some((flow) => flow.amount < 0) || !flows.some((flow) => flow.amount > 0)) return null;

  let low = -0.9999;
  let high = 10;
  let lowValue = xnpv(low, flows);
  let highValue = xnpv(high, flows);
  for (let expansion = 0; lowValue * highValue > 0 && expansion < 8; expansion += 1) {
    high *= 10;
    highValue = xnpv(high, flows);
  }
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null;
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const mid = (low + high) / 2;
    const value = xnpv(mid, flows);
    if (Math.abs(value) < 1e-7) return mid * 100;
    if (lowValue * value <= 0) {
      high = mid;
    } else {
      low = mid;
      lowValue = value;
    }
  }
  return ((low + high) / 2) * 100;
}

export function computeAdvancedPerformance(snapshots: Snapshot[], transfers: Transfer[]): AdvancedPerformanceResult {
  const twrPercent = computeTimeWeightedReturn(snapshots, transfers);
  const xirrPercent = computeXirr(snapshots, transfers);
  const issues: string[] = [];
  if (snapshots.length < 2) issues.push('至少需要两个不同日期的资产快照');
  if (twrPercent === null && snapshots.length >= 2) issues.push('快照日期、期初资产或现金流不足以计算 TWR');
  if (xirrPercent === null && snapshots.length >= 2) issues.push('现金流无法形成可求解的 XIRR');
  return { twrPercent, xirrPercent, periods: Math.max(normalizeSnapshots(snapshots).length - 1, 0), complete: issues.length === 0, issues };
}

export function computeCashFlowAdjustedPerformance(snapshots: Snapshot[], transfers: Transfer[]) {
  if (snapshots.length < 2) return null;
  const ordered = normalizeSnapshots(snapshots);
  if (ordered.length < 2) return null;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return null;
  if (new Date(first.date).getTime() >= new Date(last.date).getTime()) return null;

  const extNet = cashFlowBetween(first.date, last.date, transfers);
  const endValue = last.totalValue - first.totalValue - extNet;
  const denom = first.totalValue + Math.max(extNet, 0);
  if (denom <= 0) return null;
  const pct = (endValue / denom) * 100;
  const reliable = ordered.length >= 2 && ordered.some((s) => s.date !== first.date);
  if (!reliable && extNet === 0 && ordered.length < 3) return null;
  return { cumulativeReturn: endValue, cumulativeReturnPercent: Number.isFinite(pct) ? pct : null, periods: ordered.length - 1, isReliable: reliable || extNet !== 0 };
}

export function computeDailyMovement(snapshots: Snapshot[], transfers: Transfer[]) {
  const ordered = normalizeSnapshots(snapshots);
  if (ordered.length < 2) return null;
  const last = ordered[ordered.length - 1];
  const prev = ordered[ordered.length - 2];
  if (!last || !prev) return null;
  const day = last.date;
  const extNet = cashFlowBetween(day, day, transfers);
  const change = last.totalValue - prev.totalValue - extNet;
  const denom = prev.totalValue + Math.max(extNet, 0);
  const pct = denom > 0 ? (change / denom) * 100 : null;
  return { change, changePercent: pct };
}

export { computeStrictPerformance, createMoney };

export type { DataQuality, DataQualityIssue, PerformanceResult } from '@/lib/domain/performance';
