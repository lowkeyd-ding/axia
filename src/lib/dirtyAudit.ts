import type { Account, Position, Snapshot, Trade, Transfer } from '@/types';
import type { FxRates } from '@/lib/fx';
import { countMissingMonthEndSnapshots, listMonthEndDates } from '@/lib/monthEndSnapshots';

export interface DirtyHoldingItem {
  positionId: string;
  symbol: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DirtyMonthItem {
  date: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DirtyTradeItem {
  id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DirtyAuditReport {
  dirtyHoldings: DirtyHoldingItem[];
  dirtyMonths: DirtyMonthItem[];
  dirtyTrades: DirtyTradeItem[];
}

function isFuture(date: string): boolean {
  return date > new Date().toISOString().slice(0, 10);
}

export function auditDirtyHoldings(positions: Position[]): DirtyHoldingItem[] {
  return positions.flatMap((position) => {
    const issues: DirtyHoldingItem[] = [];
    if (!position.buyDate) {
      issues.push({ positionId: position.id, symbol: position.symbol, reason: '缺少买入日期，无法重建历史持仓', severity: 'medium' });
    } else if (isFuture(position.buyDate.slice(0, 10))) {
      issues.push({ positionId: position.id, symbol: position.symbol, reason: '买入日期晚于当前日期', severity: 'high' });
    }
    if (position.quantity <= 0) {
      issues.push({ positionId: position.id, symbol: position.symbol, reason: '持仓数量非正数', severity: 'high' });
    }
    if (position.avgCost <= 0 || position.currentPrice <= 0) {
      issues.push({ positionId: position.id, symbol: position.symbol, reason: '成本价或当前价无效', severity: 'high' });
    }
    if (position.monthlyBasePrice !== undefined && position.monthlyBasePrice <= 0) {
      issues.push({ positionId: position.id, symbol: position.symbol, reason: '月度基准价无效', severity: 'medium' });
    }
    if (position.yearlyBasePrice !== undefined && position.yearlyBasePrice <= 0) {
      issues.push({ positionId: position.id, symbol: position.symbol, reason: '年度基准价无效', severity: 'medium' });
    }
    return issues;
  });
}

export function auditDirtyMonths(accounts: Account[], positions: Position[], snapshots: Snapshot[], transfers: Transfer[], fxRates: FxRates): DirtyMonthItem[] {
  const existingDates = new Set(snapshots.map((snapshot) => snapshot.date));
  const startDate = positions.reduce((start, position) => {
    const candidate = position.buyDate ? position.buyDate.slice(0, 10) : position.createdAt.slice(0, 10);
    return candidate < start ? candidate : start;
  }, new Date().toISOString().slice(0, 10));

  const monthEnds = listMonthEndDates(startDate, new Date().toISOString().slice(0, 10));
  const missing = countMissingMonthEndSnapshots(
    {
      date: new Date().toISOString().slice(0, 10),
      accounts,
      positions,
      trades: [],
      transfers,
      fxRates,
      priceSnapshots: [],
    },
    startDate,
    existingDates
  );

  const dirty: DirtyMonthItem[] = [];
  for (const date of monthEnds) {
    if (!existingDates.has(date)) {
      dirty.push({ date, reason: '缺少月末快照', severity: 'high' });
    }
  }
  if (missing > 0 && dirty.length === 0) {
    dirty.push({ date: monthEnds[0] || startDate, reason: `仍有 ${missing} 个缺失月份`, severity: 'medium' });
  }
  return dirty;
}

export function auditDirtyTrades(trades: Trade[]): DirtyTradeItem[] {
  return trades.flatMap((trade) => {
    const issues: DirtyTradeItem[] = [];
    if (trade.quantity <= 0) {
      issues.push({ id: trade.id, reason: '交易数量非正数', severity: 'high' });
    }
    if (trade.price <= 0 || trade.total <= 0) {
      issues.push({ id: trade.id, reason: '交易价格或总额无效', severity: 'high' });
    }
    if (trade.fees < 0) {
      issues.push({ id: trade.id, reason: '手续费为负数', severity: 'medium' });
    }
    if (!trade.executedAt) {
      issues.push({ id: trade.id, reason: '缺少执行时间', severity: 'high' });
    }
    return issues;
  });
}

export function buildDirtyAuditReport(input: {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  fxRates: FxRates;
}): DirtyAuditReport {
  return {
    dirtyHoldings: auditDirtyHoldings(input.positions),
    dirtyMonths: auditDirtyMonths(input.accounts, input.positions, input.snapshots, input.transfers, input.fxRates),
    dirtyTrades: auditDirtyTrades(input.trades),
  };
}
