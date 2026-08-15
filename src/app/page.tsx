'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useAppStore } from '@/lib/store';
import type { Account, AssetType } from '@/types';
import { ASSET_TYPE_CONFIG } from '@/types';
import { useFxRates } from '@/lib/hooks/useFxRates';
import { usePnLStats } from '@/lib/hooks/usePnLStats';
import { convertToAccountCNY, getEffectiveCurrency, getPositionCurrency } from '@/lib/fx';
import { DEFAULT_PRICE_COLORS } from '@/config/colors';
import { formatCurrency, formatDualCurrency, formatPercent } from '@/utils/format';
import { computeCashFlowAdjustedPerformance, computeDailyMovement, type DataQuality } from '@/lib/performance';
import { buildDashboardSummary } from '@/lib/dashboard';
import { countDashboardMissingMonthEndSnapshots } from '@/lib/monthEndAudit';
import {
  ALLOCATION_CATEGORIES,
  calculateAllocationDeviations,
  validateAllocationRows,
  type AllocationCategory,
} from '@/lib/targetAllocation';

const ASSET_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4'];
const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  bank: '银行',
  securities: '证券',
  fund: '基金',
  other: '其他',
};

export default function HomePage() {
  const router = useRouter();
  const {
    accounts,
    positions,
    snapshots,
    transfers,
    targetAllocations,
    _syncStatus,
    _syncError,
    addTargetAllocation,
    updateTargetAllocation,
  } = useAppStore();
  const [isAllocationEditorOpen, setIsAllocationEditorOpen] = useState(false);
  const [allocationName, setAllocationName] = useState('我的目标配置');
  const [allocationRows, setAllocationRows] = useState<Record<AllocationCategory, string>>({
    stock: '',
    fund: '',
    bank_wealth_management: '',
    bank_cash: '',
    cash: '',
  });
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const { rates: fxRates } = useFxRates();
  const pnlStats = usePnLStats();

  const dashboard = useMemo(() => buildDashboardSummary({
    accounts,
    positions,
    snapshots,
    transfers,
    pnlStats,
    syncStatus: _syncStatus,
    syncError: _syncError,
    priceUpdatedAt: null,
    dataQuality: { complete: true, issues: [] },
    fxRates,
  }), [accounts, positions, snapshots, transfers, pnlStats, _syncStatus, _syncError, fxRates]);

  const totalStats = useMemo(() => {
    let totalInvestCNY = 0;
    let totalCashCNY = 0;
    let totalCostBasis = 0;

    accounts.forEach((account) => {
      const acctCcy = account.currency || 'CNY';
      totalCashCNY += convertToAccountCNY(account.balance, acctCcy, 'CNY', fxRates);
    });

    positions.forEach((p) => {
      const account = accounts.find((a) => a.id === p.accountId);
      const acctCcy = account?.currency || 'CNY';
      const posCcy = getPositionCurrency(p.symbol, p.assetType, p.currency, acctCcy);
      const positionValueCNY = convertToAccountCNY(p.currentPrice * p.quantity, posCcy, 'CNY', fxRates);
      const positionCostCNY = convertToAccountCNY(p.avgCost * p.quantity, posCcy, 'CNY', fxRates);
      totalInvestCNY += positionValueCNY;
      totalCostBasis += positionCostCNY;
    });

    return {
      totalAssetsCNY: totalInvestCNY + totalCashCNY,
      totalInvestCNY,
      totalCashCNY,
      assetPnL: totalInvestCNY - totalCostBasis,
      pnlPercent: totalCostBasis > 0 ? ((totalInvestCNY - totalCostBasis) / totalCostBasis) * 100 : 0,
    };
  }, [accounts, positions, fxRates]);

  const adjustedPerformance = useMemo(() => computeCashFlowAdjustedPerformance(snapshots, transfers), [snapshots, transfers]);
  const dailyMovement = useMemo(() => computeDailyMovement(snapshots, transfers), [snapshots, transfers]);
  const missingMonthEndCount = useMemo(() => countDashboardMissingMonthEndSnapshots({ accounts, positions, snapshots, transfers, fxRates }), [accounts, positions, snapshots, transfers, fxRates]);

  const assetAllocations = useMemo(() => {
    const allocationMap = new Map<string, { type: AssetType; name: string; value: number }>();
    (['stock', 'fund', 'bank_wealth_management', 'bank_cash'] as AssetType[]).forEach((type) => allocationMap.set(type, { type, name: ASSET_TYPE_CONFIG[type].label, value: 0 }));
    allocationMap.set('cash', { type: 'bank_cash', name: '现金', value: 0 });

    accounts.forEach((account) => {
      const cash = allocationMap.get('cash');
      if (cash) cash.value += convertToAccountCNY(account.balance, account.currency || 'CNY', 'CNY', fxRates);
    });
    positions.forEach((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      if (!account) return;
      const value = convertToAccountCNY(position.currentPrice * position.quantity, getPositionCurrency(position.symbol, position.assetType, position.currency, account.currency || 'CNY'), 'CNY', fxRates);
      const existing = allocationMap.get(position.assetType);
      if (existing) existing.value += value;
    });

    const totalValue = Array.from(allocationMap.values()).reduce((sum, item) => sum + item.value, 0);
    return Array.from(allocationMap.values())
      .filter((item) => item.value > 0)
      .map((item) => ({ type: item.type, name: item.name, value: item.value, percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0 }));
  }, [accounts, positions, fxRates]);

  const activeTargetAllocation = targetAllocations[0];
  const allocationDeviations = useMemo(() => {
    if (!activeTargetAllocation) return [];
    const current = assetAllocations.reduce<Partial<Record<AllocationCategory, number>>>((result, item) => {
      result[item.type] = (result[item.type] ?? 0) + item.percentage;
      return result;
    }, {});
    return calculateAllocationDeviations(current, activeTargetAllocation).slice(0, 3);
  }, [activeTargetAllocation, assetAllocations]);

  const topHolding = useMemo(() => {
    let best = null as null | { name: string; ratio: number };
    if (totalStats.totalInvestCNY <= 0) return best;
    positions.forEach((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      const value = convertToAccountCNY(position.currentPrice * position.quantity, getPositionCurrency(position.symbol, position.assetType, position.currency, account?.currency || 'CNY'), 'CNY', fxRates);
      const ratio = value / totalStats.totalInvestCNY;
      if (!best || ratio > best.ratio) best = { name: position.name, ratio };
    });
    return best;
  }, [accounts, positions, fxRates, totalStats.totalInvestCNY]);

  const needAttention = useMemo(() => {
    const items: string[] = [];
    if (dashboard.health.syncStatus === 'conflict') items.push('存在同步冲突，建议先处理再继续记账。');
    if (dashboard.health.missingMonthEndSnapshots > 0) items.push(`仍有 ${dashboard.health.missingMonthEndSnapshots} 条月末快照缺失。`);
    if (!dashboard.health.dataQuality.complete) items.push('当前绩效数据不完整。');
    if (topHolding && topHolding.ratio > 0.4) items.push(`持仓集中度较高，${topHolding.name} 占投资资产比重较大。`);
    return items.slice(0, 3);
  }, [dashboard.health, topHolding]);

  const hasVisibleData = accounts.length > 0 || positions.length > 0;
  const getPnLColor = (value: number) => (value > 0 ? DEFAULT_PRICE_COLORS.rise : value < 0 ? DEFAULT_PRICE_COLORS.fall : 'text-zinc-400');

  const openRoute = (path: string) => router.push(path);
  const saveAllocation = () => {
    const rows = ALLOCATION_CATEGORIES.flatMap(({ category }) => {
      const raw = allocationRows[category].trim();
      return raw === '' ? [] : [{ category, percentage: Number(raw) }];
    });
    const error = !allocationName.trim() ? '请输入目标配置名称。' : validateAllocationRows(rows);
    if (error) {
      setAllocationError(error);
      return;
    }
    if (activeTargetAllocation) updateTargetAllocation(activeTargetAllocation.id, { name: allocationName.trim(), allocations: rows });
    else addTargetAllocation({ name: allocationName.trim(), allocations: rows });
    setIsAllocationEditorOpen(false);
  };

  const accountSummaries = useMemo(() => accounts.map((account) => {
    const accountPositions = positions.filter((p) => p.accountId === account.id);
    const acctCcy = account.currency || 'CNY';
    const investValueCNY = accountPositions.reduce((sum, p) => sum + convertToAccountCNY(p.currentPrice * p.quantity, getPositionCurrency(p.symbol, p.assetType, p.currency, acctCcy), 'CNY', fxRates), 0);
    const balanceCNY = convertToAccountCNY(account.balance, acctCcy, 'CNY', fxRates);
    const valueCNY = balanceCNY + investValueCNY;
    const percentage = totalStats.totalAssetsCNY > 0 ? (valueCNY / totalStats.totalAssetsCNY) * 100 : 0;
    return { id: account.id, name: account.name, type: account.type, institution: account.institution, holder: account.holder, value: account.balance + accountPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0), valueCNY, currency: account.currency, percentage };
  }), [accounts, positions, totalStats.totalAssetsCNY, fxRates]);

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_30%),linear-gradient(to_bottom,#fafafa,#f8fafc)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <section className="rounded-[28px] border border-white/60 bg-white/85 p-6 shadow-[0_12px_40px_rgba(24,24,27,0.06)] backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-600">数据健康</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">决策工作台</h1>
              <p className="mt-2 text-sm text-zinc-500">先看状态，再看组合，再看行动。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {dashboard.actions.slice(0, 3).map((action) => (
                <button key={action.id} onClick={() => openRoute(action.href)} className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200">
                  {action.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
              <p className="text-xs text-zinc-500">同步状态</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{dashboard.health.syncStatus === 'conflict' ? '冲突' : dashboard.health.syncStatus === 'dirty' ? '未同步' : dashboard.health.syncStatus === 'error' ? '错误' : '健康'}</p>
              <p className="mt-1 text-xs text-zinc-500">{dashboard.health.syncMessage || '数据已就绪'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
              <p className="text-xs text-zinc-500">月末快照缺口</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{dashboard.health.missingMonthEndSnapshots} 条</p>
              <p className="mt-1 text-xs text-zinc-500">需要补齐的历史月份</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
              <p className="text-xs text-zinc-500">数据完整性</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{dashboard.health.dataQuality.complete ? '完整' : '不完整'}</p>
              <p className="mt-1 text-xs text-zinc-500">{dashboard.health.priceHealth === 'fresh' ? '价格有效' : '价格待确认'}</p>
            </div>
          </div>
          {needAttention.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {needAttention.join(' ')}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-zinc-900">今日组合状态</h2>
              <p className="text-xs text-zinc-500">总资产、现金和投资资产都来自当前账本投影。</p>
            </div>
            <Link href="/snapshots" className="text-sm text-blue-600 hover:text-blue-700">查看快照 →</Link>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div><p className="text-xs text-zinc-500">总资产</p><p className="mt-1 text-2xl font-semibold text-zinc-900">{hasVisibleData ? formatDualCurrency(totalStats.totalAssetsCNY, 'CNY') : '¥0.00'}</p></div>
            <div><p className="text-xs text-zinc-500">现金</p><p className="mt-1 text-2xl font-semibold text-blue-600">{hasVisibleData ? formatDualCurrency(totalStats.totalCashCNY, 'CNY') : '¥0.00'}</p></div>
            <div><p className="text-xs text-zinc-500">投资资产</p><p className="mt-1 text-2xl font-semibold text-zinc-900">{hasVisibleData ? formatDualCurrency(totalStats.totalInvestCNY, 'CNY') : '¥0.00'}</p></div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-zinc-900">绩效</h2>
              <p className="text-xs text-zinc-500">区分今日变动、持仓盈亏和现金流调整后表现。</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div><p className="text-xs text-zinc-500">今日变动</p><p className={`mt-1 text-lg font-semibold ${dailyMovement && dailyMovement.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>{dailyMovement ? `${formatCurrency(dailyMovement.change)} (${formatPercent(dailyMovement.changePercent ?? 0)})` : '暂无数据'}</p></div>
            <div><p className="text-xs text-zinc-500">本月收益</p><p className={`mt-1 text-lg font-semibold ${getPnLColor(pnlStats.monthly.change)}`}>{formatCurrency(pnlStats.monthly.change)} ({formatPercent(pnlStats.monthly.changePercent)})</p></div>
            <div><p className="text-xs text-zinc-500">现金流调整后表现</p><p className="mt-1 text-lg font-semibold text-zinc-900">{adjustedPerformance?.cumulativeReturnPercent != null ? formatPercent(adjustedPerformance.cumulativeReturnPercent) : '数据不足'}</p></div>
          </div>
        </section>

        {activeTargetAllocation && allocationDeviations.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium text-zinc-900">策略偏离</h2>
                <p className="text-xs text-zinc-500">只看偏离最大的三项。</p>
              </div>
              <button onClick={() => setIsAllocationEditorOpen(true)} className="text-sm text-blue-600 hover:text-blue-700">编辑目标</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {allocationDeviations.map((item) => (
                <div key={item.category} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                  <p className="mt-2 text-sm text-zinc-600">当前 {item.currentPercentage.toFixed(1)}% · 目标 {item.targetPercentage.toFixed(1)}%</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900">偏离 {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-zinc-900">行动</h2>
              <p className="text-xs text-zinc-500">只保留最关键的入口。</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {dashboard.actions.map((action) => (
              <button key={action.id} onClick={() => openRoute(action.href)} className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200">
                {action.label}
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link href="/accounts" className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">账户</Link>
          <Link href="/positions" className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">持仓</Link>
          <Link href="/trades" className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">交易</Link>
          <Link href="/snapshots" className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">快照</Link>
        </div>
      </main>
    </div>
  );
}
