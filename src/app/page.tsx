'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
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
import { convertToAccountCNY, getEffectiveCurrency } from '@/lib/fx';
import { DEFAULT_PRICE_COLORS } from '@/config/colors';
import { formatCurrency, formatPercent } from '@/utils/format';

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
type Benchmark = 'none' | '000300' | '399006' | 'sp500' | 'hsi';
const BENCHMARK_OPTIONS: { value: Benchmark; label: string; color: string }[] = [
  { value: 'none', label: '无', color: '#71717a' },
  { value: '000300', label: '沪深300', color: '#f59e0b' },
  { value: '399006', label: '创业板', color: '#8b5cf6' },
  { value: 'sp500', label: '标普500', color: '#3b82f6' },
  { value: 'hsi', label: '恒生指数', color: '#06b6d4' },
];

// 模拟基准指数数据（实际项目中应从API获取）
const BENCHMARK_DATA: Record<Benchmark, { startDate: string; startValue: number; monthlyChange: number[] }> = {
  none: { startDate: '', startValue: 100, monthlyChange: [] },
  '000300': { startDate: '2024-01-01', startValue: 100, monthlyChange: [2.1, 1.3, -0.8, 1.9, 0.5, -2.1, 1.2, 0.8, -1.5, 2.3, 1.1, 0.7] },
  '399006': { startDate: '2024-01-01', startValue: 100, monthlyChange: [3.5, 2.1, -1.2, 2.8, 0.9, -3.5, 2.0, 1.5, -2.2, 3.1, 1.8, 1.2] },
  'sp500': { startDate: '2024-01-01', startValue: 100, monthlyChange: [1.6, 2.3, 1.1, 0.8, 1.5, -0.5, 2.1, 1.3, -0.9, 1.7, 2.0, 1.4] },
  'hsi': { startDate: '2024-01-01', startValue: 100, monthlyChange: [-1.2, 3.5, 0.8, 2.1, -0.6, -2.8, 1.5, 2.2, -1.8, 1.3, 0.9, 1.1] },
};

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
  const { accounts, positions, snapshots } = useAppStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('thisYear');
  const [benchmark, setBenchmark] = useState<Benchmark>('none');
  const { rates: fxRates } = useFxRates();

  const totalStats = useMemo(() => {
    let totalValueCNY = 0;
    let totalCostBasis = 0;
    let totalCashCNY = 0;

    // 现金余额折算：账户币种 ≠ CNY → 现汇卖出价换算
    accounts.forEach((account) => {
      const acctCcy = account.currency || 'CNY';
      const cashValue = convertToAccountCNY(account.balance, acctCcy, 'CNY', fxRates);
      totalCashCNY += cashValue;
    });

    // 持仓市值 + 成本折算：统一走 convertToAccountCNY
    positions.forEach((p) => {
      const account = accounts.find((a) => a.id === p.accountId);
      const acctCcy = account?.currency || 'CNY';
      const posCcy = getEffectiveCurrency(p.currency, acctCcy);

      const value = convertToAccountCNY(p.currentPrice * p.quantity, posCcy, 'CNY', fxRates);
      const cost  = convertToAccountCNY(p.avgCost * p.quantity, posCcy, 'CNY', fxRates);
      totalValueCNY += value;
      totalCostBasis += cost;
    });

    const totalAssetsCNY = totalCashCNY + totalValueCNY;
    const totalPnL = totalValueCNY - totalCostBasis;
    const pnlPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

    return { totalValueCNY: totalAssetsCNY, totalInvestCNY: totalValueCNY, totalCashCNY, totalPnL, pnlPercent };
  }, [accounts, positions, fxRates]);

  // 计算收益率曲线数据
  const yieldCurveData = useMemo((): YieldDataPoint[] => {
    if (snapshots.length === 0) return [];

    // 按日期排序快照
    const sortedSnapshots = [...snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 确定时间范围
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

    // 筛选时间范围内的快照
    const filteredSnapshots = sortedSnapshots.filter(
      (s) => new Date(s.date) >= startDate
    );

    if (filteredSnapshots.length === 0) return [];

    // 初始值（基准100）
    const initialValue = filteredSnapshots[0].totalValue;
    if (initialValue <= 0) return [];

    // 生成数据点
    const dataPoints: YieldDataPoint[] = filteredSnapshots.map((snapshot) => {
      const yieldPercent = ((snapshot.totalValue / initialValue) - 1) * 100;
      const dateObj = new Date(snapshot.date);
      return {
        date: snapshot.date,
        dateLabel: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
        portfolio: parseFloat(yieldPercent.toFixed(2)),
      };
    });

    // 添加基准指数数据
    if (benchmark !== 'none') {
      const benchData = BENCHMARK_DATA[benchmark];
      const benchStartDate = new Date(benchData.startDate);
      const benchInitialValue = benchData.startValue;

      // 生成与快照对应的基准数据
      dataPoints.forEach((point) => {
        const pointDate = new Date(point.date);
        if (pointDate >= benchStartDate) {
          const monthsDiff = (pointDate.getFullYear() - benchStartDate.getFullYear()) * 12 +
            (pointDate.getMonth() - benchStartDate.getMonth());
          let benchValue = benchInitialValue;
          for (let i = 0; i < Math.min(monthsDiff, benchData.monthlyChange.length); i++) {
            benchValue *= (1 + benchData.monthlyChange[i] / 100);
          }
          point.benchmark = parseFloat(((benchValue / benchInitialValue - 1) * 100).toFixed(2));
        }
      });
    }

    return dataPoints;
  }, [snapshots, timeRange, benchmark]);

  // 计算当前收益率
  const currentYield = useMemo(() => {
    if (yieldCurveData.length < 2) return { portfolio: 0, benchmark: 0 };
    const last = yieldCurveData[yieldCurveData.length - 1];
    return {
      portfolio: last.portfolio,
      benchmark: last.benchmark ?? 0,
    };
  }, [yieldCurveData]);

  const assetAllocations = useMemo((): AssetAllocation[] => {
    const allocationMap = new Map<AssetType, { value: number }>();

    (['stock', 'fund', 'bank_wealth_management', 'bank_cash'] as AssetType[]).forEach((type) => {
      allocationMap.set(type, { value: 0 });
    });

    positions.forEach((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      if (!account) return;

      const acctCcy = account.currency || 'CNY';
      const posCcy  = getEffectiveCurrency(position.currency, acctCcy);
      const value = convertToAccountCNY(position.currentPrice * position.quantity, posCcy, 'CNY', fxRates);

      const existing = allocationMap.get(position.assetType);
      if (existing) existing.value += value;
    });

    const totalValue = Array.from(allocationMap.values()).reduce((sum, a) => sum + a.value, 0);

    return Array.from(allocationMap.entries())
      .filter(([, data]) => data.value > 0)
      .map(([type, data]) => ({
        type,
        name: ASSET_TYPE_CONFIG[type].label,
        value: data.value,
        percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      }));
  }, [accounts, positions, fxRates]);

  const pieData = assetAllocations.map((a) => ({
    name: a.name,
    value: a.value,
  }));

  const accountSummaries = useMemo(() => {
    return accounts.map((account) => {
      const accountPositions = positions.filter((p) => p.accountId === account.id);
      const acctCcy = account.currency || 'CNY';
      let investValueCNY = 0;

      accountPositions.forEach((p) => {
        const posCcy = getEffectiveCurrency(p.currency, acctCcy);
        investValueCNY += convertToAccountCNY(p.currentPrice * p.quantity, posCcy, 'CNY', fxRates);
      });

      // 现金折算：账户币种 ≠ CNY → 现汇卖出价
      const balanceCNY = convertToAccountCNY(account.balance, acctCcy, 'CNY', fxRates);
      const valueCNY = balanceCNY + investValueCNY;

      const percentage = totalStats.totalValueCNY > 0 ? (valueCNY / totalStats.totalValueCNY) * 100 : 0;

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
  }, [accounts, positions, totalStats.totalValueCNY, fxRates]);

  const hasData = accounts.length > 0 && positions.length > 0;

  // 计算盈亏颜色 (A股红涨绿跌)
  const getPnLColor = (value: number) => {
    if (value > 0) return DEFAULT_PRICE_COLORS.rise;
    if (value < 0) return DEFAULT_PRICE_COLORS.fall;
    return 'text-zinc-400';
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-6">
        {/* 总览区 */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center md:text-left">
              <p className="text-sm text-zinc-500 mb-2">持仓总市值（CNY）</p>
              <p className="text-3xl font-bold text-zinc-900">
                {hasData ? formatCurrency(totalStats.totalValueCNY) : '¥0.00'}
              </p>
            </div>
            <div className="text-center md:border-x md:border-zinc-200">
              <p className="text-sm text-zinc-500 mb-2">总浮盈亏</p>
              <p className={`text-3xl font-bold ${getPnLColor(totalStats.totalPnL)}`}>
                {hasData ? (
                  <>
                    {totalStats.totalPnL >= 0 ? '+' : '-'}
                    {formatCurrency(totalStats.totalPnL)}
                  </>
                ) : (
                  <span className="text-zinc-400">¥0.00</span>
                )}
              </p>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm text-zinc-500 mb-2">浮盈亏%</p>
              <p className={`text-3xl font-bold ${getPnLColor(totalStats.pnlPercent)}`}>
                {hasData ? formatPercent(totalStats.pnlPercent) : '0.00%'}
              </p>
            </div>
          </div>
        </div>

        {/* 资产配置饼图 & 目标对比 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 饼图 */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-medium text-zinc-900 mb-4">资产配置</h2>
            {hasData && pieData.length > 0 ? (
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
              <h2 className="text-base font-medium text-zinc-900">收益率曲线</h2>
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

            {hasData && yieldCurveData.length > 0 ? (
              <>
                {/* 当前收益率显示 */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-zinc-600">我的组合</span>
                    <span className={`text-sm font-medium ${getPnLColor(currentYield.portfolio)}`}>
                      {formatPercent(currentYield.portfolio)}
                    </span>
                  </div>
                  {benchmark !== 'none' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-sm text-zinc-600">
                        {BENCHMARK_OPTIONS.find(b => b.value === benchmark)?.label}
                      </span>
                      <span className={`text-sm font-medium ${getPnLColor(currentYield.benchmark)}`}>
                        {formatPercent(currentYield.benchmark)}
                      </span>
                    </div>
                  )}
                  <div className="ml-auto">
                    <select
                      value={benchmark}
                      onChange={(e) => setBenchmark(e.target.value as Benchmark)}
                      className="bg-zinc-100 border border-zinc-300 rounded-lg px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:border-blue-500"
                    >
                      {BENCHMARK_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          对比: {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                          name === 'portfolio' ? '我的组合' : BENCHMARK_OPTIONS.find(b => b.value === benchmark)?.label || '基准'
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
                      {benchmark !== 'none' && (
                        <Line
                          type="monotone"
                          dataKey="benchmark"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-center">
                <p className="text-sm text-zinc-500 mb-2">暂无收益率数据</p>
                <p className="text-xs text-zinc-400">
                  请先在快照页面记录资产快照
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 账户汇总卡片 */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
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

        {/* 快捷入口 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
    </div>
  );
}
