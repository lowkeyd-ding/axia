import type { Account, Position, Snapshot, Transfer } from '@/types';
import type { FxRates } from '@/lib/fx';
import type { PnLStats } from '@/lib/hooks/usePnLStats';
import type { DataQuality } from '@/lib/domain/performance';
import { countMissingMonthEndSnapshots } from '@/lib/monthEndSnapshots';
import { getBusinessDate } from '@/lib/businessDate';

export interface DashboardHealth {
  syncStatus: 'healthy' | 'dirty' | 'conflict' | 'error';
  syncMessage?: string;
  missingMonthEndSnapshots: number;
  hasSnapshots: boolean;
  dataQuality: DataQuality;
  priceHealth: 'fresh' | 'stale' | 'unknown';
}

export interface DashboardAction {
  id: string;
  label: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DashboardSummary {
  health: DashboardHealth;
  actions: DashboardAction[];
  dataSources: string[];
}

export function buildDashboardSummary(input: {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  transfers: Transfer[];
  pnlStats: PnLStats;
  syncStatus: string;
  syncError?: string | null;
  priceUpdatedAt?: string | null;
  dataQuality?: DataQuality;
  fxRates: FxRates;
}): DashboardSummary {
  const missingMonthEndSnapshots = countMissingMonthEndSnapshots(
    {
      date: getBusinessDate(),
      accounts: input.accounts,
      positions: input.positions,
      trades: [],
      transfers: input.transfers,
      fxRates: input.fxRates,
      priceSnapshots: [],
    },
    input.positions.reduce((start, position) => {
      const candidate = position.buyDate ? position.buyDate.slice(0, 10) : position.createdAt.slice(0, 10);
      return candidate < start ? candidate : start;
    }, getBusinessDate()),
    new Set(input.snapshots.map((snapshot) => snapshot.date))
  );

  const actions: DashboardAction[] = [];
  if (input.syncStatus === 'conflict') {
    actions.push({ id: 'sync-conflict', label: '处理同步冲突', href: '/snapshots', priority: 'high' });
  }
  if (missingMonthEndSnapshots > 0) {
    actions.push({ id: 'fix-snapshots', label: '补齐月末快照', href: '/snapshots', priority: 'high' });
  }
  if (!input.accounts.length || !input.positions.length) {
    actions.push({ id: 'add-data', label: '记录交易', href: '/trades?new=1', priority: 'high' });
  }
  actions.push({ id: 'refresh-price', label: '刷新行情', href: '/positions', priority: 'medium' });

  const health: DashboardHealth = {
    syncStatus: input.syncStatus === 'conflict' ? 'conflict' : input.syncStatus === 'error' ? 'error' : input.syncStatus === 'dirty' ? 'dirty' : 'healthy',
    syncMessage: input.syncError || undefined,
    missingMonthEndSnapshots,
    hasSnapshots: input.snapshots.length > 0,
    dataQuality: input.dataQuality || { complete: true, issues: [] },
    priceHealth: input.priceUpdatedAt ? 'fresh' : 'unknown',
  };

  return {
    health,
    actions,
    dataSources: [
      '账户余额与持仓来自账本状态',
      '收益来自绩效引擎',
      '月末缺口来自快照审计',
      '策略偏离来自目标配置引擎',
    ],
  };
}
