'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { getPrice } from '@/lib/priceApi';
import { ASSET_TYPE_CONFIG, type Account, type AssetType, type Lot } from '@/types';

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  bank: '银行',
  securities: '证券',
  fund: '基金',
  other: '其他',
};

export default function PositionDetailClient() {
  const params = useParams();
  const positionId = params.id as string;
  const { positions, accounts, trades, lots, updatePosition, deletePosition } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const position = positions.find((p) => p.id === positionId);
  const account = position ? accounts.find((a) => a.id === position.accountId) : undefined;
  const positionTrades = position
    ? trades.filter((t) => t.accountId === position.accountId && t.symbol === position.symbol)
    : [];

  const handleRefreshPrice = async () => {
    if (!position || isRefreshing) return;
    if (position.assetType === 'bank_wealth_management' || position.assetType === 'bank_cash') {
      return;
    }

    setIsRefreshing(true);
    try {
      const result = await getPrice(position.symbol);
      if (result) {
        updatePosition(positionId, { currentPrice: result.price });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = () => {
    if (confirm('确定要删除这条持仓吗？')) {
      deletePosition(positionId);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (value: number, currency = 'CNY') => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format price for display - funds need 4 decimal places
  const formatPrice = (value: number, assetType: AssetType) => {
    const decimals = assetType === 'fund' ? 4 : 2;
    return value.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const isBankProduct = (type: AssetType) =>
    type === 'bank_wealth_management' || type === 'bank_cash';

  const getPriceSourceLabel = (type: AssetType) => {
    if (type === 'fund') return '基金净值';
    if (type === 'stock') return '实时行情';
    return '手动更新';
  };

  if (!position) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-5">
            <Link
              href="/positions"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              返回持仓明细
            </Link>
          </div>
        </header>
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-700 mb-1">持仓不存在</h2>
            <p className="text-sm text-zinc-500">该持仓可能已被删除</p>
          </div>
        </main>
      </div>
    );
  }

  const currency = account?.currency ?? 'CNY';
  const currentValue = position.currentPrice * position.quantity;
  const costBasis = position.avgCost * position.quantity;
  const pnlAmount = currentValue - costBasis;
  const pnlPercent = costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0;
  const assetConfig = ASSET_TYPE_CONFIG[position.assetType];
  const isBank = isBankProduct(position.assetType);
  const canAutoRefresh = !isBank;

  const pnlColor =
    pnlAmount > 0 ? 'text-red-500' : pnlAmount < 0 ? 'text-green-600' : 'text-zinc-400';

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <Link
            href="/positions"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            返回持仓明细
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{position.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-zinc-500">{position.symbol}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${assetConfig.color}`}>
                  {assetConfig.label}
                </span>
                <span className="text-xs text-zinc-500">
                  {getPriceSourceLabel(position.assetType)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canAutoRefresh && (
                <button
                  onClick={handleRefreshPrice}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <svg
                    className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  更新价格
                </button>
              )}
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-zinc-500">
              {isBank ? '收益金额' : '浮盈亏'}
            </span>
            <span className={`text-lg font-semibold ${pnlColor}`}>
              {pnlAmount >= 0 ? '+' : '-'}{formatCurrency(pnlAmount, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              {isBank ? '收益率' : '浮盈亏率'}
            </span>
            <span className={`text-lg font-semibold ${pnlColor}`}>{formatPercent(pnlPercent)}</span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-base font-medium text-zinc-900 mb-4">基本信息</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500">所属账户</span>
              <span className="text-sm text-zinc-900">
                {account?.name ?? '未知账户'}
                {account && (
                  <span className="ml-2 text-xs text-zinc-400">
                    ({ACCOUNT_TYPE_LABELS[account.type]})
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500">买入日期</span>
              <span className="text-sm text-zinc-900">
                {position.buyDate
                  ? formatDate(position.buyDate)
                  : formatDate(position.createdAt)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-zinc-500">最后更新</span>
              <span className="text-sm text-zinc-900">{formatDate(position.updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-medium text-zinc-900 mb-4">持仓详情</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="py-2 border-b border-zinc-100">
                <span className="text-xs text-zinc-500 block mb-1">
                  {isBank ? '购买金额' : '持有数量'}
                </span>
                <span className="text-lg font-medium text-zinc-900">
                  {isBank
                    ? formatCurrency(position.quantity, currency)
                    : formatNumber(position.quantity, 4)}
                </span>
              </div>
              <div className="py-2 border-b border-zinc-100">
                <span className="text-xs text-zinc-500 block mb-1">
                  {isBank ? '购买净值' : '成本价'}
                </span>
                <span className="text-lg font-medium text-zinc-900">
                  {position.assetType === 'fund' ? formatPrice(position.avgCost, position.assetType) : formatCurrency(position.avgCost, currency)}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="py-2 border-b border-zinc-100">
                <span className="text-xs text-zinc-500 block mb-1">
                  {isBank ? '当前净值' : '现价'}
                </span>
                <span className="text-lg font-medium text-zinc-900">
                  {position.assetType === 'fund' ? formatPrice(position.currentPrice, position.assetType) : formatCurrency(position.currentPrice, currency)}
                </span>
              </div>
              <div className="py-2 border-b border-zinc-100">
                <span className="text-xs text-zinc-500 block mb-1">
                  {isBank ? '当前价值' : '市值'}
                </span>
                <span className="text-lg font-medium text-zinc-900">
                  {formatCurrency(currentValue, currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                {isBank ? '购买成本' : '成本合计'}
              </span>
              <span className="text-sm text-zinc-700">{formatCurrency(costBasis, currency)}</span>
            </div>
          </div>
        </div>

        {positionTrades.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-medium text-zinc-900 mb-4">交易记录</h2>
            <div className="space-y-2">
              {positionTrades.slice(0, 5).map((trade) => {
                const isBuy = trade.type === 'buy';
                return (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        isBuy ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-500'
                      }`}>
                        {isBuy ? '买入' : '卖出'}
                      </span>
                      <span className="text-sm text-zinc-600">
                        {trade.quantity} @ {position.assetType === 'fund' ? formatPrice(trade.price, position.assetType) : formatCurrency(trade.price, currency)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-medium ${
                        isBuy ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {isBuy ? '-' : '+'}{formatCurrency(trade.total, currency)}
                      </span>
                      <p className="text-xs text-zinc-400">
                        {new Date(trade.executedAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                );
              })}
              {positionTrades.length > 5 && (
                <Link
                  href="/trades"
                  className="block text-center text-sm text-blue-500 hover:text-blue-600 py-2"
                >
                  查看全部 {positionTrades.length} 笔交易 →
                </Link>
              )}
            </div>
          </div>
        )}

        {(() => {
          const activeLots = lots.filter(
            (l) => l.positionId === positionId && !l.deletedAt && l.remainingQuantity > 0
          );
          if (activeLots.length === 0) return null;

          return (
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-medium text-zinc-900 mb-4">买入批次</h2>
              <div className="space-y-3">
                {activeLots.map((lot) => {
                  const lotValue = lot.remainingQuantity * position.currentPrice;
                  const lotCost = lot.remainingQuantity * lot.price;
                  const lotPnl = lotValue - lotCost;
                  const lotPnlPercent = lotCost > 0 ? (lotPnl / lotCost) * 100 : 0;
                  const lotPnlColor = lotPnl >= 0 ? 'text-red-500' : 'text-green-600';

                  return (
                    <div
                      key={lot.id}
                      className="flex items-center justify-between py-3 border-b border-zinc-100 last:border-0"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-zinc-900">
                            {formatNumber(lot.remainingQuantity, 4)}
                          </span>
                          <span className="text-xs text-zinc-500">
                            @ {position.assetType === 'fund'
                              ? formatPrice(lot.price, position.assetType)
                              : formatCurrency(lot.price, currency)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-400">
                          <span>买入 {new Date(lot.executedAt).toLocaleDateString('zh-CN')}</span>
                          <span>成本 {formatCurrency(lotCost, currency)}</span>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className={`text-sm font-medium ${lotPnlColor}`}>
                          {lotPnl >= 0 ? '+' : ''}{formatCurrency(lotPnl, currency)}
                        </div>
                        <div className={`text-xs ${lotPnlColor}`}>
                          {lotPnlPercent >= 0 ? '+' : ''}{lotPnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">累计成本</span>
                  <span className="text-sm font-medium text-zinc-700">
                    {formatCurrency(
                      activeLots.reduce((sum, l) => sum + l.remainingQuantity * l.price, 0),
                      currency
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
