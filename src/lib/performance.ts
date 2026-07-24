import type { Snapshot, Transfer } from '@/types';

export interface CashFlowAdjustedPerformanceResult {
  cumulativeReturn: number;
  cumulativeReturnPercent: number | null;
  periods: number;
  isReliable: boolean;
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
