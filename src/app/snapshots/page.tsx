'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { useAppStore } from '@/lib/store';
import { ASSET_TYPE_CONFIG, type AssetType, type Snapshot, type PositionValue } from '@/types';
import { getExchangeRates } from '@/lib/exchangeRates';
import { DEFAULT_EXCHANGE_RATES, type ExchangeRates } from '@/config/exchangeRates';
import { formatCurrency, formatPercent } from '@/utils/format';

interface FormData {
  date: string;
  note: string;
}

export default function SnapshotsPage() {
  const { snapshots, accounts, positions, addSnapshot, deleteSnapshot } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [compareSnapshot, setCompareSnapshot] = useState<Snapshot | null>(null);
  const [currencyRates, setCurrencyRates] = useState<ExchangeRates>(DEFAULT_EXCHANGE_RATES);
  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  // Fetch exchange rates on mount
  useEffect(() => {
    getExchangeRates().then(setCurrencyRates);
  }, []);

  // Calculate current portfolio value
  const currentStats = useMemo(() => {
    let totalValue = 0;
    let totalCash = 0;
    let totalInvestments = 0;

    accounts.forEach((account) => {
      const rate = currencyRates[account.currency] ?? 1;
      totalCash += account.balance * rate;

      const accountPositions = positions.filter((p) => p.accountId === account.id);
      const investValue = accountPositions.reduce((sum, p) => {
        const positionCurrency = p.currency || account.currency || 'CNY';
        const posRate = currencyRates[positionCurrency] ?? 1;
        return sum + p.currentPrice * p.quantity * posRate;
      }, 0);
      totalInvestments += investValue;
      totalValue += (account.balance + investValue) * rate;
    });

    // Calculate change from first snapshot
    const firstSnapshot = snapshots[snapshots.length - 1];
    const totalChange = firstSnapshot ? totalValue - firstSnapshot.totalValue : 0;
    const totalChangePercent = firstSnapshot && firstSnapshot.totalValue > 0
      ? ((totalValue - firstSnapshot.totalValue) / firstSnapshot.totalValue) * 100
      : 0;

    // Calculate daily change (from previous snapshot)
    const prevSnapshot = snapshots[0];
    const dailyChange = prevSnapshot ? totalValue - prevSnapshot.totalValue : 0;
    const dailyChangePercent = prevSnapshot && prevSnapshot.totalValue > 0
      ? ((totalValue - prevSnapshot.totalValue) / prevSnapshot.totalValue) * 100
      : 0;

    // Asset allocation
    const allocationMap = new Map<AssetType, number>();
    (['stock', 'fund', 'bank_wealth_management', 'bank_cash'] as AssetType[]).forEach((type) => {
      allocationMap.set(type, 0);
    });

    positions.forEach((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      if (!account) return;
      const positionCurrency = position.currency || account.currency || 'CNY';
      const rate = currencyRates[positionCurrency] ?? 1;
      const value = position.currentPrice * position.quantity * rate;
      allocationMap.set(position.assetType, (allocationMap.get(position.assetType) || 0) + value);
    });

    const allocations = Array.from(allocationMap.entries())
      .filter(([, value]) => value > 0)
      .map(([type, value]) => ({
        type,
        value,
        percentage: totalInvestments > 0 ? (value / totalInvestments) * 100 : 0,
      }));

    // Account values
    const accountValues = accounts.map((account) => {
      const rate = currencyRates[account.currency] ?? 1;
      const accountPositions = positions.filter((p) => p.accountId === account.id);
      const investValue = accountPositions.reduce((sum, p) => {
        const positionCurrency = p.currency || account.currency || 'CNY';
        const posRate = currencyRates[positionCurrency] ?? 1;
        return sum + p.currentPrice * p.quantity * posRate;
      }, 0);
      return {
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        value: (account.balance + investValue) * rate,
        cash: account.balance * rate,
        investments: investValue,
      };
    });

    // Position values
    const positionValues: PositionValue[] = positions.map((position) => {
      const account = accounts.find((a) => a.id === position.accountId);
      const positionCurrency = position.currency || account?.currency || 'CNY';
      const rate = currencyRates[positionCurrency] ?? 1;
      const value = position.currentPrice * position.quantity * rate;
      const costBasis = position.avgCost * position.quantity * rate;
      const pnl = value - costBasis;
      const pnlPercent = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : 0;
      return {
        positionId: position.id,
        symbol: position.symbol,
        name: position.name,
        assetType: position.assetType,
        quantity: position.quantity,
        avgCost: position.avgCost * rate,
        currentPrice: position.currentPrice * rate,
        value,
        pnl,
        pnlPercent,
      };
    });

    return {
      totalValue,
      totalCash,
      totalInvestments,
      totalChange,
      totalChangePercent,
      dailyChange,
      dailyChangePercent,
      allocations,
      accountValues,
      positionValues,
    };
  }, [accounts, positions, snapshots]);

  // Chart data
  const chartData = useMemo(() => {
    return [...snapshots].reverse().map((snapshot) => ({
      date: new Date(snapshot.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
      value: snapshot.totalValue,
    }));
  }, [snapshots]);

  const createSnapshot = () => {
    const { totalValue, totalCash, totalInvestments, totalChange, totalChangePercent, dailyChange, dailyChangePercent, allocations, accountValues, positionValues } = currentStats;

    addSnapshot({
      date: formData.date,
      totalValue,
      cash: totalCash,
      investments: totalInvestments,
      dailyChange,
      dailyChangePercent,
      totalChange,
      totalChangePercent,
      allocations,
      accountValues,
      positionValues,
      note: formData.note || undefined,
    });

    setFormData({ date: new Date().toISOString().slice(0, 10), note: '' });
    setIsModalOpen(false);
  };

  const getComparison = (snapshot: Snapshot) => {
    if (!compareSnapshot) return null;
    if (snapshot.id === compareSnapshot.id) return null;

    const older = snapshots.find((s) => s.id === compareSnapshot.id);
    const newer = snapshot;
    if (!older) return null;

    return {
      valueChange: newer.totalValue - older.totalValue,
      valueChangePercent: older.totalValue > 0
        ? ((newer.totalValue - older.totalValue) / older.totalValue) * 100
        : 0,
      cashChange: newer.cash - older.cash,
      investChange: newer.investments - older.investments,
    };
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">资产快照</h1>
              <p className="mt-1 text-sm text-zinc-500">
                共 {snapshots.length} 个快照
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              记录快照
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Current Stats Card */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-zinc-900">当前资产</h2>
            <span className="text-xs text-zinc-500">
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-zinc-500 mb-1">总资产 (CNY)</p>
              <p className="text-2xl font-bold text-zinc-900">
                {formatCurrency(currentStats.totalValue)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500 mb-1">持仓市值</p>
              <p className="text-2xl font-bold text-zinc-900">
                {formatCurrency(currentStats.totalInvestments)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500 mb-1">可用现金</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(currentStats.totalCash)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500 mb-1">累计收益</p>
              <p className={`text-2xl font-bold ${
                currentStats.totalChange >= 0 ? 'text-red-500' : 'text-green-600'
              }`}>
                {currentStats.totalChange >= 0 ? '+' : '-'}{formatCurrency(currentStats.totalChange)}
              </p>
            </div>
          </div>

          {/* Asset Allocation */}
          {currentStats.allocations.length > 0 && (
            <div className="mt-6 pt-6 border-t border-zinc-200">
              <p className="text-sm text-zinc-500 mb-3">资产配置</p>
              <div className="flex flex-wrap gap-3">
                {currentStats.allocations.map((alloc) => {
                  const config = ASSET_TYPE_CONFIG[alloc.type];
                  return (
                    <div
                      key={alloc.type}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.color}`}
                    >
                      <span>{config.icon}</span>
                      <span className="text-sm font-medium">{config.label}</span>
                      <span className="text-sm">{alloc.percentage.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Trend Chart */}
        {snapshots.length >= 2 && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-medium text-zinc-900 mb-4">资产趋势</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                  <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}w`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                      color: '#18181b',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value) => [formatCurrency(value as number), '资产']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Snapshots List */}
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-700 mb-1">暂无快照</h2>
            <p className="text-sm text-zinc-500">点击右上角按钮记录您的第一个快照</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Compare selector */}
            {snapshots.length >= 2 && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-zinc-600">对比快照:</span>
                <select
                  value={compareSnapshot?.id || ''}
                  onChange={(e) => {
                    const snapshot = snapshots.find((s) => s.id === e.target.value);
                    setCompareSnapshot(snapshot || null);
                  }}
                  className="px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">选择快照对比</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.date).toLocaleDateString('zh-CN')} - {formatCurrency(s.totalValue)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {snapshots.map((snapshot) => {
              const comparison = getComparison(snapshot);
              const dailyColor = snapshot.dailyChange >= 0 ? 'text-red-500' : 'text-green-600';

              return (
                <div
                  key={snapshot.id}
                  className={`bg-white border rounded-xl p-4 transition-colors cursor-pointer ${
                    selectedSnapshot?.id === snapshot.id
                      ? 'border-blue-500 shadow-sm'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                  onClick={() => setSelectedSnapshot(selectedSnapshot?.id === snapshot.id ? null : snapshot)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-base font-medium text-zinc-900">
                          {new Date(snapshot.date).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                        {snapshot.note && (
                          <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                            {snapshot.note}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
                        <span>持仓: {formatCurrency(snapshot.investments)}</span>
                        <span>现金: {formatCurrency(snapshot.cash)}</span>
                      </div>
                    </div>
                    <div className="text-right ml-4 space-y-1">
                      <p className="text-lg font-semibold text-zinc-900">
                        {formatCurrency(snapshot.totalValue)}
                      </p>
                      <div className={`flex items-center justify-end gap-2 text-sm ${dailyColor}`}>
                        <span>{snapshot.dailyChange >= 0 ? '+' : ''}{formatCurrency(snapshot.dailyChange)}</span>
                        <span className="text-xs">({formatPercent(snapshot.dailyChangePercent)})</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {selectedSnapshot?.id === snapshot.id && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 space-y-4">
                      {/* Comparison */}
                      {comparison && (
                        <div className="p-3 bg-zinc-50 rounded-lg">
                          <p className="text-xs text-zinc-500 mb-2">
                            相比 {new Date(compareSnapshot!.date).toLocaleDateString('zh-CN')}
                          </p>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-zinc-500">资产变化</span>
                              <p className={`font-medium ${comparison.valueChange >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {comparison.valueChange >= 0 ? '+' : ''}{formatCurrency(comparison.valueChange)}
                                <span className="text-xs ml-1">({formatPercent(comparison.valueChangePercent)})</span>
                              </p>
                            </div>
                            <div>
                              <span className="text-zinc-500">持仓变化</span>
                              <p className={`font-medium ${comparison.investChange >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {comparison.investChange >= 0 ? '+' : ''}{formatCurrency(comparison.investChange)}
                              </p>
                            </div>
                            <div>
                              <span className="text-zinc-500">现金变化</span>
                              <p className={`font-medium ${comparison.cashChange >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {comparison.cashChange >= 0 ? '+' : ''}{formatCurrency(comparison.cashChange)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Asset allocation */}
                      <div>
                        <p className="text-sm text-zinc-600 mb-2">资产配置</p>
                        <div className="flex flex-wrap gap-2">
                          {snapshot.allocations.map((alloc) => {
                            const config = ASSET_TYPE_CONFIG[alloc.type];
                            return (
                              <div
                                key={alloc.type}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded border ${config.color}`}
                              >
                                <span className="text-xs">{config.icon}</span>
                                <span className="text-xs">{config.label}</span>
                                <span className="text-xs font-medium">{alloc.percentage.toFixed(1)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Account breakdown */}
                      <div>
                        <p className="text-sm text-zinc-600 mb-2">账户明细</p>
                        <div className="space-y-2">
                          {snapshot.accountValues.map((av) => (
                            <div key={av.accountId} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-700">{av.accountName}</span>
                              <div className="flex items-center gap-4 text-zinc-500">
                                <span>持仓 {formatCurrency(av.investments)}</span>
                                <span>现金 {formatCurrency(av.cash)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Position details */}
                      {snapshot.positionValues.length > 0 && (
                        <div>
                          <p className="text-sm text-zinc-600 mb-2">持仓明细</p>
                          <div className="space-y-1.5">
                            {snapshot.positionValues.map((pv) => {
                              const config = ASSET_TYPE_CONFIG[pv.assetType];
                              return (
                                <div key={pv.positionId} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-100 last:border-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded border ${config.color}`}>
                                      {config.icon} {pv.symbol}
                                    </span>
                                    <span className="text-zinc-700">{pv.name}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-zinc-500">
                                    <span>{pv.quantity}</span>
                                    <span className={pv.pnl >= 0 ? 'text-red-500' : 'text-green-600'}>
                                      {pv.pnl >= 0 ? '+' : ''}{formatCurrency(pv.pnl)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Delete button */}
                      <div className="pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('确定要删除这个快照吗？')) {
                              deleteSnapshot(snapshot.id);
                              if (selectedSnapshot?.id === snapshot.id) {
                                setSelectedSnapshot(null);
                              }
                            }
                          }}
                          className="text-sm text-red-400 hover:text-red-300 transition-colors"
                        >
                          删除快照
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Snapshot Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-100">记录快照</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  快照日期
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  备注 (可选)
                </label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="例如：月底总结、年中盘点"
                  className="w-full px-3.5 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
                />
              </div>

              {/* Preview */}
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2">
                <p className="text-sm text-zinc-500">快照预览</p>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">总资产</span>
                  <span className="text-lg font-semibold text-zinc-900">
                    {formatCurrency(currentStats.totalValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">持仓 + 现金</span>
                  <span className="text-zinc-700">
                    {formatCurrency(currentStats.totalInvestments)} + {formatCurrency(currentStats.totalCash)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-zinc-200">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={createSnapshot}
                className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                保存快照
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
