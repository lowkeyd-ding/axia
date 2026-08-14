'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useAppStore } from '@/lib/store';
import type { Account, AssetType } from '@/types';
import { ASSET_TYPE_CONFIG } from '@/types';
import { useFxRates } from '@/lib/hooks/useFxRates';
import { usePnLStats } from '@/lib/hooks/usePnLStats';
import { convertToAccountCNY, getEffectiveCurrency, getPositionCurrency } from '@/lib/fx';
import { DEFAULT_PRICE_COLORS } from '@/config/colors';
import { formatCurrency, formatDualCurrency, formatPercent } from '@/utils/format';
import { computeCashFlowAdjustedPerformance, computeDailyMovement } from '@/lib/performance';
import { BENCHMARK_META } from '@/lib/benchmark';
import {
  ALLOCATION_CATEGORIES,
  calculateAllocationDeviations,
  validateAllocationRows,
  type AllocationCategory,
} from '@/lib/targetAllocation';

const ASSET_COLORS = [
  '#3b82f6', // blue - stock
  '#8b5cf6', // violet - fund
  '#f59e0b', // amber - bank_wealth_management
  '#06b6d4', // cyan - bank_cash (改为科技感蓝色系)
  '#ef4444', // red
  '#14b8a6', // teal
  '#ec4899', // pink
  '#84cc16', // lime
];

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  bank: '银行',
  securities: '证券',
  fund: '基金',
  other: '其他',
};

// 收益率曲线时间范围
type TimeRange = 'thisYear' | 'oneYear' | 'sinceInception';
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'thisYear', label: '今年' },
  { value: 'oneYear', label: '近一年' },
  { value: 'sinceInception', label: '记账以来' },
];

// 基准指数选项
const BENCHMARK_OPTIONS = BENCHMARK_META.map((item) => ({
  value: item.id,
  label: item.name,
  color: item.historyComplete ? '#3b82f6' : '#71717a',
  disabled: !item.historyComplete,
  reason: item.disabledReason || '暂无可验证的基准历史数据',
}));

interface YieldDataPoint {
  date: string;
  dateLabel: string;
  portfolio: number;
  benchmark?: number;
}

interface AssetAllocation {
  type: AssetType;
  name: string;
  value: number;
  percentage: number;
  targetPercentage?: number;
  deviation?: number;
  isOverDeviation?: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const {
    accounts,
    positions,
    snapshots,
    transfers,
    targetAllocations,
    addTargetAllocation,
    updateTargetAllocation,
  } = useAppStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('thisYear');
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

  const adjustedPerformance = useMemo(
    () => computeCashFlowAdjustedPerformance(snapshots, transfers),
    [snapshots, transfers]
  );
  const dailyMovement = useMemo(
    () => computeDailyMovement(snapshots, transfers),
    [snapshots, transfers]
  );

  // 资产变化曲线：包含外部资金流，不代表投资回报
  const yieldCurveData = useMemo((): YieldDataPoint[] => {
    if (snapshots.length === 0) return [];

    const sortedSnapshots = [...snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const now = new Date();
    const startDate = new Date();
    switch (timeRange) {
      case 'thisYear':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'oneYear':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'sinceInception':
        if (sortedSnapshots.length > 0) {
          startDate.setTime(new Date(sortedSnapshots[0].date).getTime());
        }
        break;
    }

    const filteredSnapshots = sortedSnapshots.filter((s) => new Date(s.date) >= startDate);
    if (filteredSnapshots.length === 0) return [];

    const initialValue = filteredSnapshots[0].totalValue;
    if (initialValue <= 0) return [];

    return filteredSnapshots.map((snapshot) => {
      const yieldPercent = ((snapshot.totalValue / initialValue) - 1) * 100;
      const dateObj = new Date(snapshot.date);
      return {
        date: snapshot.date,
        dateLabel: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
        portfolio: parseFloat(yieldPercent.toFixed(2)),
      };
    });
  }, [snapshots, timeRange]);

  // 计算当前收益率
  const currentYield = useMemo(() => {
    if (yieldCurveData.length < 2) return 0;
    return yieldCurveData[yieldCurveData.length - 1].portfolio;
  }, [yieldCurveData]);

  const assetAllocations = useMemo((): AssetAllocation[] => {
    const allocationMap = new Map<string, { type: AssetType; name: string; value: number }>();
    (['stock', 'fund', 'bank_wealth_management', 'bank_cash'] as AssetType[]).forEach((type) => {
      allocationMap.set(type, { type, name: ASSET_TYPE_CONFIG[type].label, value: 0 });
    });
    allocationMap.set('cash', { type: 'bank_cash', name: '现金', value: 0 });

    accounts.forEach((account) => {
      const acctCcy = account.currency || 'CNY';
      const cashValue = convertToAccountCNY(account.balance, acctCcy, 'CNY', fxRates);
      const cash = allocationMap.get('cash');
      if (cash) cash.value += cashValue;
    });

    positions.forEach((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      if (!account) return;
      const acctCcy = account.currency || 'CNY';
      const posCcy = getPositionCurrency(position.symbol, position.assetType, position.currency, acctCcy);
      const value = convertToAccountCNY(position.currentPrice * position.quantity, posCcy, 'CNY', fxRates);
      const existing = allocationMap.get(position.assetType);
      if (existing) existing.value += value;
    });

    const totalValue = Array.from(allocationMap.values()).reduce((sum, a) => sum + a.value, 0);
    return Array.from(allocationMap.values())
      .filter((data) => data.value > 0)
      .map((data) => ({
        type: data.type,
        name: data.name,
        value: data.value,
        percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      }));
  }, [accounts, positions, fxRates]);

  const pieData = assetAllocations.map((a) => ({
    name: a.name,
    value: a.value,
  }));

  const activeTargetAllocation = targetAllocations[0];
  const allocationDeviations = useMemo(() => {
    if (!activeTargetAllocation) return [];
    const current = assetAllocations.reduce<Partial<Record<AllocationCategory, number>>>((result, item) => {
      result[item.type] = (result[item.type] ?? 0) + item.percentage;
      return result;
    }, {});
    return calculateAllocationDeviations(current, activeTargetAllocation).slice(0, 3);
  }, [activeTargetAllocation, assetAllocations]);

  const openAllocationEditor = () => {
    const existing = targetAllocations[0];
    setAllocationName(existing?.name || '我的目标配置');
    setAllocationRows({
      stock: String(existing?.allocations.find((item) => item.category === 'stock')?.percentage ?? ''),
      fund: String(existing?.allocations.find((item) => item.category === 'fund')?.percentage ?? ''),
      bank_wealth_management: String(existing?.allocations.find((item) => item.category === 'bank_wealth_management')?.percentage ?? ''),
      bank_cash: String(existing?.allocations.find((item) => item.category === 'bank_cash')?.percentage ?? ''),
      cash: String(existing?.allocations.find((item) => item.category === 'cash')?.percentage ?? ''),
    });
    setAllocationError(null);
    setIsAllocationEditorOpen(true);
  };

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
    if (activeTargetAllocation) {
      updateTargetAllocation(activeTargetAllocation.id, { name: allocationName.trim(), allocations: rows });
    } else {
      addTargetAllocation({ name: allocationName.trim(), allocations: rows });
    }
    setIsAllocationEditorOpen(false);
  };

  const accountSummaries = useMemo(() => {
    return accounts.map((account) => {
      const accountPositions = positions.filter((p) => p.accountId === account.id);
      const acctCcy = account.currency || 'CNY';
      let investValueCNY = 0;

      accountPositions.forEach((p) => {
        const posCcy = getPositionCurrency(p.symbol, p.assetType, p.currency, acctCcy);
        investValueCNY += convertToAccountCNY(p.currentPrice * p.quantity, posCcy, 'CNY', fxRates);
      });

      // 现金折算：账户币种 ≠ CNY → 现汇卖出价
      const balanceCNY = convertToAccountCNY(account.balance, acctCcy, 'CNY', fxRates);
      const valueCNY = balanceCNY + investValueCNY;

      const percentage = totalStats.totalAssetsCNY > 0 ? (valueCNY / totalStats.totalAssetsCNY) * 100 : 0;

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        holder: account.holder,
        value: account.balance + accountPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0),
        valueCNY,
        currency: account.currency,
        percentage,
      };
    });
  }, [accounts, positions, totalStats.totalAssetsCNY, fxRates]);

  const hasAccounts = accounts.length > 0;
  const hasPositions = positions.length > 0;
  const hasSnapshots = snapshots.length > 0;
  const hasVisibleData = hasAccounts && (hasPositions || totalStats.totalCashCNY > 0);
  const refreshablePositions = useMemo(() => {
    return positions.filter((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      const acctCcy = account?.currency || 'CNY';
      const posCcy = getEffectiveCurrency(position.currency, acctCcy);
      return convertToAccountCNY(position.currentPrice * position.quantity, posCcy, 'CNY', fxRates) > 0;
    });
  }, [accounts, positions, fxRates]);
  const topHolding = useMemo(() => {
    let best = null as null | { name: string; ratio: number };
    if (totalStats.totalInvestCNY <= 0) return best;
    positions.forEach((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      const acctCcy = account?.currency || 'CNY';
      const posCcy = getEffectiveCurrency(position.currency, acctCcy);
      const value = convertToAccountCNY(position.currentPrice * position.quantity, posCcy, 'CNY', fxRates);
      const ratio = value / totalStats.totalInvestCNY;
      if (!best || ratio > best.ratio) best = { name: position.name, ratio };
    });
    return best;
  }, [accounts, positions, fxRates, totalStats.totalInvestCNY]);
  const needAttention = useMemo(() => {
    const items: string[] = [];
    if (positions.some((p) => p.currentPrice <= 0)) {
      items.push('部分持仓尚未刷新行情，可前往持仓页更新。');
    }
    if (topHolding && topHolding.ratio > 0.4) {
      items.push(`持仓集中度较高，${topHolding.name} 占投资资产比重较大。`);
    }
    if (totalStats.totalAssetsCNY > 0 && totalStats.totalCashCNY / totalStats.totalAssetsCNY > 0.3) {
      items.push('现金占比较高，可根据你的记账节奏持续关注资产配置。');
    }
    return items.slice(0, 3);
  }, [positions, topHolding, totalStats.totalAssetsCNY, totalStats.totalCashCNY]);
  const openRoute = (path: string) => router.push(path);

  // 计算盈亏颜色 (A股红涨绿跌)
  const getPnLColor = (value: number) => {
    if (value > 0) return DEFAULT_PRICE_COLORS.rise;
    if (value < 0) return DEFAULT_PRICE_COLORS.fall;
    return 'text-zinc-400';
  };

  return (
    <div className="flex flex-col min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_30%),linear-gradient(to_bottom,#fafafa,#f8fafc)] text-zinc-900">
      <main className="flex flex-col flex-1 max-w-5xl mx-auto w-full px-4 py-6 gap-6">
        {/* 第一部分：总览区 */}
        <div className="order-1 relative overflow-hidden bg-white/80 backdrop-blur border border-white/60 rounded-[28px] p-6 shadow-[0_12px_40px_rgba(24,24,27,0.06)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="md:col-span-1">
              <p className="text-sm text-zinc-500 mb-2">总资产</p>
              <p className="text-3xl font-bold text-zinc-900 leading-tight">
                {hasVisibleData ? formatDualCurrency(totalStats.totalAssetsCNY, 'CNY') : '¥0.00'}
              </p>
              <p className="mt-2 text-xs text-zinc-500">包含现金与持仓市值</p>
            </div>
            <div className="md:col-span-1 md:border-x md:border-zinc-200 md:px-6">
              <p className="text-sm text-zinc-500 mb-2">投资盈亏</p>
              <p className={`text-3xl font-bold leading-tight ${getPnLColor(totalStats.assetPnL)}`}>
                {hasVisibleData ? (
                  <>
                    {totalStats.assetPnL >= 0 ? '+' : '-'}{formatDualCurrency(Math.abs(totalStats.assetPnL), 'CNY')}
                  </>
                ) : (
                  <span className="text-zinc-400">¥0.00</span>
                )}
              </p>
              <p className="mt-2 text-xs text-zinc-500">仅统计持仓收益，不含现金变动</p>
            </div>
            <div className="md:col-span-1 md:text-right">
              <p className="text-sm text-zinc-500 mb-2">投资盈亏率</p>
              <p className={`text-3xl font-bold leading-tight ${getPnLColor(totalStats.pnlPercent)}`}>
                {hasVisibleData ? formatPercent(totalStats.pnlPercent) : '0.00%'}
              </p>
              <p className="mt-2 text-xs text-zinc-500">相对持仓成本的变动幅度</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {refreshablePositions.length > 0 && (
              <button onClick={() => openRoute('/positions?new=1')} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-zinc-100 text-zinc-700 text-sm font-medium hover:bg-zinc-200">
                刷新行情
              </button>
            )}
            <button onClick={() => openRoute('/trades?new=1')} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-zinc-100 text-zinc-700 text-sm font-medium hover:bg-zinc-200">
              记录交易
            </button>
            <button onClick={() => openRoute('/snapshots?new=1')} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100">
              记录快照
            </button>
          </div>

          {/* 周期盈亏 */}
          {positions.length > 0 && (
            <div className="mt-5 pt-5 border-t border-zinc-100 grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <p className="text-zinc-400 text-xs mb-1">今日变动</p>
                {dailyMovement ? (
                  <p className={`font-semibold ${dailyMovement.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatCurrency(dailyMovement.change)}
                    <span className="text-xs font-normal ml-1">({formatPercent(dailyMovement.changePercent ?? 0)})</span>
                  </p>
                ) : (
                  <p className="font-semibold text-zinc-400">暂无数据</p>
                )}
              </div>
              <div className="text-center border-x border-zinc-100">
                <p className="text-zinc-400 text-xs mb-1">本月变动</p>
                <p className={`font-semibold ${pnlStats.monthly.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {formatCurrency(pnlStats.monthly.change)}
                  <span className="text-xs font-normal ml-1">({formatPercent(pnlStats.monthly.changePercent)})</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-zinc-400 text-xs mb-1">今年变动</p>
                <p className={`font-semibold ${pnlStats.yearly.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {formatCurrency(pnlStats.yearly.change)}
                  <span className="text-xs font-normal ml-1">({formatPercent(pnlStats.yearly.changePercent)})</span>
                </p>
              </div>
            </div>
          )}


        </div>

        {/* 第三部分：组合检查 */}
        {activeTargetAllocation && allocationDeviations.length > 0 && (
          <section className="order-3 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-600">组合检查</p>
                <h2 className="mt-1 text-base font-semibold text-zinc-900">配置偏离</h2>
                <p className="mt-1 text-xs text-zinc-500">只展示偏离最大的 3 项，仅作配置提醒，不构成投资建议。</p>
              </div>
              <button onClick={openAllocationEditor} className="text-sm font-medium text-blue-600 hover:text-blue-700">编辑目标</button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {allocationDeviations.map((item) => (
                <div key={item.category} className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-900">{item.label}</span>
                    <span className={`text-xs font-medium ${Math.abs(item.deviation) > 5 ? 'text-amber-600' : 'text-zinc-500'}`}>
                      {Math.abs(item.deviation) > 5 ? '偏离较大' : item.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-zinc-400">当前</p><p className="mt-1 font-semibold text-zinc-800">{item.currentPercentage.toFixed(1)}%</p></div>
                    <div><p className="text-zinc-400">目标</p><p className="mt-1 font-semibold text-zinc-800">{item.targetPercentage.toFixed(1)}%</p></div>
                    <div><p className="text-zinc-400">偏离</p><p className="mt-1 font-semibold text-zinc-800">{item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%</p></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!activeTargetAllocation && (
          <button onClick={openAllocationEditor} className="order-3 w-full rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5 text-left hover:bg-blue-50 transition-colors">
            <p className="text-sm font-semibold text-zinc-900">设置目标配置</p>
            <p className="mt-1 text-xs text-zinc-500">为股票、基金、现金和银行理财设置目标比例，帮助发现组合偏离。</p>
          </button>
        )}

        {/* 第四部分：资产配置和资产趋势 */}
        <div className="order-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 饼图 */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-medium text-zinc-900 mb-2">资产配置</h2>
            <p className="text-xs text-zinc-500 mb-4">按总资产拆分持仓与现金</p>
            {hasVisibleData && pieData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={ASSET_COLORS[index % ASSET_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '8px',
                        color: '#18181b',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                      formatter={(value) => formatCurrency(value as number)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-4 max-w-full">
                  {assetAllocations.map((allocation, index) => (
                    <div key={allocation.type} className="flex items-center gap-1.5 px-1.5">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ASSET_COLORS[index % ASSET_COLORS.length] }}
                      />
                      <span className="text-xs text-zinc-600 whitespace-nowrap">
                        {allocation.name} <span className="text-zinc-900 font-medium">{allocation.percentage.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center">
                <p className="text-sm text-zinc-500">暂无数据</p>
              </div>
            )}
          </div>

          {/* 收益率曲线 */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-medium text-zinc-900">账户资产趋势</h2>
                <p className="text-xs text-zinc-500 mt-1">充值、取现和转账都会影响曲线</p>
              </div>
              <div className="flex items-center gap-2">
                {/* 时间范围选择 */}
                <div className="flex items-center bg-zinc-100 rounded-lg p-0.5">
                  {TIME_RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setTimeRange(option.value)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        timeRange === option.value
                          ? 'bg-blue-500 text-white'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {hasVisibleData && yieldCurveData.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 mb-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {BENCHMARK_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        disabled={option.disabled}
                        title={option.disabled ? option.reason : option.label}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                          option.disabled
                            ? 'border-zinc-200 text-zinc-400 bg-zinc-50 cursor-not-allowed'
                            : 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100'
                        }`}
                      >
                        {option.label}
                        {!option.disabled && <span className="ml-1 text-[10px]">可用</span>}
                      </button>
                    ))}
                  </div>
                  <div className="text-zinc-400">暂无可验证的基准历史数据</div>
                </div>
                {/* 当前收益率显示 */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-zinc-600">组合收益</span>
                    <span className={`text-sm font-medium ${getPnLColor(currentYield)}`}>
                      {formatPercent(currentYield)}
                    </span>
                  </div>
                  <div className="ml-auto text-xs text-zinc-400">同一时间区间、同一基准日期、同币种口径</div>
                </div>

                {/* 收益率图表 */}
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={yieldCurveData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis
                        dataKey="dateLabel"
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        tickLine={{ stroke: '#e4e4e7' }}
                        axisLine={{ stroke: '#e4e4e7' }}
                      />
                      <YAxis
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        tickLine={{ stroke: '#e4e4e7' }}
                        axisLine={{ stroke: '#e4e4e7' }}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e4e4e7',
                          borderRadius: '8px',
                          color: '#18181b',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(value, name) => [
                          `${Number(value).toFixed(2)}%`,
                          name === 'portfolio' ? '我的组合' : '基准'
                        ]}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <ReferenceLine y={0} stroke="#d4d4d8" strokeDasharray="3 3" />
                      <Line
                        type="monotone"
                        dataKey="portfolio"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                      />
                    
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>数据来源：暂无可验证的基准历史数据</span>
                  <span>最后更新时间：--</span>
                </div>
              </>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-center">
                <p className="text-sm text-zinc-500 mb-2">暂无可验证的基准历史数据</p>
                <p className="text-xs text-zinc-400">
                  请先补充真实历史行情来源，当前不会回退到模拟数组
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 第二部分：账户汇总 */}
        <div className="order-2 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-zinc-900">账户汇总</h2>
            <Link
              href="/accounts"
              className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
            >
              管理账户 →
            </Link>
          </div>
          {accountSummaries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {accountSummaries.map((account) => (
                <Link
                  key={account.id}
                  href={`/positions?account=${account.id}`}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-900 truncate">{account.name}</h3>
                      <p className="text-xs text-zinc-500">
                        {account.institution || ACCOUNT_TYPE_LABELS[account.type]}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                      {ACCOUNT_TYPE_LABELS[account.type]}
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="text-lg font-semibold text-zinc-900">
                      {formatCurrency(account.value, account.currency)}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-zinc-500">折CNY</p>
                      <p className="text-xs text-zinc-600">
                        {formatCurrency(account.valueCNY)}{' '}
                        <span className="text-zinc-500">
                          ({account.percentage.toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-zinc-500 mb-3">暂无账户</p>
              <Link
                href="/accounts"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加账户
              </Link>
            </div>
          )}
        </div>

        {/* 第五部分：现金流调整与快捷操作 */}
        <section className="order-5 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-800">现金流调整后表现</p>
              <p className="mt-1 text-xs text-zinc-500">尽可能剔除外部入金和取现；至少需要两次不同日期的快照。</p>
            </div>
            {adjustedPerformance?.cumulativeReturnPercent != null ? (
              <p className={`text-xl font-semibold whitespace-nowrap ${getPnLColor(adjustedPerformance.cumulativeReturnPercent)}`}>{formatPercent(adjustedPerformance.cumulativeReturnPercent)}</p>
            ) : (
              <Link href="/snapshots?new=1" className="text-sm font-medium text-blue-600 whitespace-nowrap hover:text-blue-700">数据不足，记录快照</Link>
            )}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">汇率口径：港币账户按前一交易日中行港币卖出价；港股通按结算汇率。</p>
        </section>

        {/* 快捷入口 */}
        <div className="order-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/accounts"
            className="flex flex-col items-center gap-2 bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <span className="text-sm text-zinc-700">账户</span>
          </Link>
          <Link
            href="/positions"
            className="flex flex-col items-center gap-2 bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm text-zinc-700">持仓</span>
          </Link>
          <Link
            href="/trades"
            className="flex flex-col items-center gap-2 bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <span className="text-sm text-zinc-700">交易</span>
          </Link>
          <Link
            href="/snapshots"
            className="flex flex-col items-center gap-2 bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-sm text-zinc-700">快照</span>
          </Link>
        </div>
      </main>

      {isAllocationEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && setIsAllocationEditorOpen(false)}>
          <div className="w-full max-w-lg rounded-[24px] border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">目标配置</h2>
                <p className="mt-1 text-xs text-zinc-500">总和可低于 100%，未配置部分将保留。现金参与目标配置。</p>
              </div>
              <button onClick={() => setIsAllocationEditorOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="关闭">×</button>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">配置名称</label>
                <input value={allocationName} onChange={(event) => setAllocationName(event.target.value)} className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ALLOCATION_CATEGORIES.map(({ category, label }) => (
                  <label key={category} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <span className="text-sm font-medium text-zinc-700">{label}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={allocationRows[category]}
                        onChange={(event) => setAllocationRows((current) => ({ ...current, [category]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="未配置"
                      />
                      <span className="text-sm text-zinc-400">%</span>
                    </div>
                  </label>
                ))}
              </div>
              {allocationError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{allocationError}</p>}
            </div>
            <div className="flex gap-3 border-t border-zinc-100 px-6 py-4">
              <button onClick={() => setIsAllocationEditorOpen(false)} className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">取消</button>
              <button onClick={saveAllocation} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">保存目标</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
