'use client';

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from 'react';
import { formatBusinessDateTime } from '@/lib/businessDate';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { refreshPricesByType, getPrice, type PriceData } from '@/lib/priceApi';
import { searchSymbols, type SymbolInfo } from '@/lib/symbolLookup';
import type { Position, Account, AssetType } from '@/types';
import { ASSET_TYPE_CONFIG } from '@/types';
import { formatCurrency, formatDualCurrency, formatNativeAmount, formatPercent } from '@/utils/format';
import { DEFAULT_PRICE_COLORS } from '@/config/colors';
import { usePnLStats, computePositionPnLRaw } from '@/lib/hooks/usePnLStats';
import { useFxRates } from '@/lib/hooks/useFxRates';

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  bank: '银行',
  securities: '证券',
  fund: '基金',
  other: '其他',
};

const ASSET_TYPES: AssetType[] = ['stock', 'fund', 'bank_wealth_management', 'bank_cash'];

interface FormData {
  accountId: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  currency: string;
  quantity: string;
  avgCost: string;
  currentPrice: string;
  buyDate: string;
  expectedReturn?: string; // For bank_wealth_management
  maturityDate?: string; // For bank_wealth_management
}

const initialFormData: FormData = {
  accountId: '',
  assetType: 'stock',
  symbol: '',
  name: '',
  currency: '',
  quantity: '',
  avgCost: '',
  currentPrice: '',
  buyDate: new Date().toISOString().slice(0, 10),
};

function PositionsPageContent() {
  const router = useRouter();
  const { positions, accounts, addPosition, updatePosition, deletePosition } = useAppStore();
  const pnlStats = usePnLStats();
  const searchParams = useSearchParams();
  const filterAccountId = searchParams.get('account');

  // Pre-compute period P&L for each position (pure function, no hooks)
  const { rates: fxRates } = useFxRates();
  const periodPnLMap = useMemo(() => {
    const result = new Map<string, { daily: number; monthly: number; yearly: number }>();
    positions.forEach((pos) => {
      const pnl = computePositionPnLRaw(pos, accounts, fxRates);
      result.set(pos.id, {
        daily: pnl.daily.change,
        monthly: pnl.monthly.change,
        yearly: pnl.yearly.change,
      });
    });
    return result;
  }, [positions, accounts, fxRates]);

  const [priceTierMap, setPriceTierMap] = useState<Map<string, { tier: string; sourceLabel?: string; timestamp?: string }>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolInfo[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [refreshingSymbols, setRefreshingSymbols] = useState<Set<string>>(new Set());
  const [priceUpdateToast, setPriceUpdateToast] = useState<{ success: number; failed: number } | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const symbolInputRef = useRef<HTMLInputElement>(null);

  // Filter positions by account if filterAccountId is set
  const filteredPositions = useMemo(() => {
    if (!filterAccountId) return positions;
    return positions.filter(p => p.accountId === filterAccountId);
  }, [positions, filterAccountId]);

  const filterAccount = filterAccountId ? accounts.find(a => a.id === filterAccountId) : null;

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear toast after 3 seconds
  useEffect(() => {
    if (priceUpdateToast) {
      const timer = setTimeout(() => setPriceUpdateToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [priceUpdateToast]);

  const handleSymbolSearch = useCallback((query: string) => {
    if (query.length < 1) {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const results = searchSymbols(query, formData.assetType === 'fund' ? 'fund' : 'stock');
    setSymbolSuggestions(results);
    setShowSuggestions(results.length > 0);
  }, [formData.assetType]);

  const selectSuggestion = (info: SymbolInfo) => {
    setFormData((prev) => ({
      ...prev,
      symbol: info.symbol,
      name: info.name,
      assetType: info.assetType,
    }));
    setSymbolSuggestions([]);
    setShowSuggestions(false);
  };

  const handleAssetTypeChange = (type: AssetType) => {
    setFormData((prev) => ({
      ...prev,
      assetType: type,
      symbol: '',
      name: '',
    }));
    setSymbolSuggestions([]);
    setShowSuggestions(false);
  };

  // Refresh all positions
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    let successCount = 0;
    let failedCount = 0;

    try {
      // Filter out bank products (bank_wealth_management and bank_cash) - they don't have tradeable symbols
      const tradeablePositions = positions.filter(
        (p) => p.assetType !== 'bank_wealth_management' && p.assetType !== 'bank_cash' && p.symbol
      );
      const uniquePositions = [...new Map(
        tradeablePositions.map((position) => [position.symbol.toUpperCase(), position])
      ).values()];
      const symbols = uniquePositions.map((position) => position.symbol.toUpperCase());
      const assetTypes = uniquePositions.map((position) => position.assetType as 'stock' | 'fund');
      const result = await refreshPricesByType(symbols, assetTypes);

      // Update prices for any successfully fetched symbols
      // Even if some symbols failed, update the ones that succeeded
      if (result.prices && result.prices.length > 0) {
        result.prices.forEach((priceData) => {
          const matchingPositions = positions.filter(
            (position) => position.symbol.toUpperCase() === priceData.symbol.toUpperCase()
          );
          matchingPositions.forEach((position) => {
            updatePosition(position.id, { currentPrice: priceData.price });
            const cacheKey = position.id;
            setPriceTierMap((current) => {
              const next = new Map(current);
              next.set(cacheKey, {
                tier: priceData.dataTier || 'cached',
                sourceLabel: priceData.sourceLabel,
                timestamp: priceData.timestamp,
              });
              return next;
            });
            successCount++;
          });
        });
        setLastRefresh(new Date());
      }

      const normalizeSymbol = (value: string) => value.toUpperCase().replace(/\.OF$/, '');
      const successfulSymbols = new Set(result.prices?.map((p) => normalizeSymbol(p.symbol)) || []);
      failedCount = symbols.filter((s) => !successfulSymbols.has(normalizeSymbol(s))).length;
      const failureMap = new Map<string, string>();
      (result.errorDetails || []).forEach((item) => {
        failureMap.set(normalizeSymbol(item.symbol), item.reason);
      });
      const fallbackFailures = (result.errors || [])
        .map((message) => {
          const [symbol, ...rest] = message.split(':');
          return { symbol: symbol.trim(), reason: rest.join(':').trim() || '未知原因' };
        });
      fallbackFailures.forEach((item) => {
        const key = normalizeSymbol(item.symbol);
        if (!failureMap.has(key)) {
          failureMap.set(key, item.reason);
        }
      });
      const failedBySymbol = symbols
        .filter((s) => !successfulSymbols.has(normalizeSymbol(s)))
        .map((symbol) => `${symbol}: ${failureMap.get(normalizeSymbol(symbol)) || '未命中任何可用来源'}`);
      if (successCount > 0) {
        setRefreshStatus(
          failedCount > 0
            ? `部分行情更新失败（成功 ${successCount}，失败 ${failedCount}）\n${failedBySymbol.join('\n')}`
            : `已于 ${formatBusinessDateTime(new Date())} 刷新`
        );
      } else if (failedCount > 0) {
        setRefreshStatus(`行情更新失败（失败 ${failedCount}）\n${failedBySymbol.join('\n') || '请稍后重试'}`);
      } else if (symbols.length === 0) {
        setRefreshStatus('暂无可更新的行情标的');
      }
    } catch {
      failedCount = positions.filter(
        (p) => p.assetType !== 'bank_wealth_management' && p.assetType !== 'bank_cash'
      ).length;
      setRefreshStatus(failedCount > 0 ? `行情更新失败（失败 ${failedCount}）\n请检查网络或上游接口` : '暂无可更新的行情标的');
    } finally {
      setIsRefreshing(false);
      if (successCount > 0 || failedCount > 0) {
        setPriceUpdateToast({ success: successCount, failed: failedCount });
      }
    }
  }, [positions, isRefreshing, updatePosition]);

  // Refresh single position price
  const handleRefreshSingle = async (position: Position) => {
    if (refreshingSymbols.has(position.symbol)) return;

    setRefreshingSymbols((prev) => new Set(prev).add(position.symbol));

    try {
      const result = await getPrice(position.symbol, position.assetType as 'stock' | 'fund');

      if (result) {
        updatePosition(position.id, { currentPrice: result.price });
        setPriceTierMap((current) => {
          const next = new Map(current);
          next.set(position.id, {
            tier: result.dataTier || 'cached',
            sourceLabel: result.sourceLabel,
            timestamp: result.timestamp,
          });
          return next;
        });
        setRefreshStatus(`已于 ${formatBusinessDateTime(new Date())} 刷新`);
        setPriceUpdateToast({ success: 1, failed: 0 });
      } else {
        setRefreshStatus(`行情更新失败（成功 0，失败 1）\n${position.symbol}: 请检查该基金是否能访问上游净值接口`);
        setPriceUpdateToast({ success: 0, failed: 1 });
      }
    } catch {
      setRefreshStatus('行情更新失败（成功 0，失败 1）；请检查网络或上游接口');
      setPriceUpdateToast({ success: 0, failed: 1 });
    } finally {
      setRefreshingSymbols((prev) => {
        const next = new Set(prev);
        next.delete(position.symbol);
        return next;
      });
    }
  };

  // Format price for display - funds need 4 decimal places
  const formatPrice = (value: number, assetType: string) => {
    const decimals = assetType === 'fund' ? 4 : 2;
    return value.toFixed(decimals);
  };

  // 盈亏颜色 (A股红涨绿跌)
  const getPnLColor = (value: number) => {
    if (value > 0) return DEFAULT_PRICE_COLORS.rise;
    if (value < 0) return DEFAULT_PRICE_COLORS.fall;
    return 'text-zinc-400';
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.name ?? '未知账户';
  };

  const getAccountCurrency = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.currency ?? 'CNY';
  };

  const calculatePnL = (position: Position) => {
    const currentValue = position.currentPrice * position.quantity;
    const costBasis = position.avgCost * position.quantity;
    const pnlAmount = currentValue - costBasis;
    const pnlPercent = costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0;
    return { pnlAmount, pnlPercent, currentValue, costBasis };
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.accountId) newErrors.accountId = '请选择账户';
    if (!formData.symbol.trim()) newErrors.symbol = '请输入代码或名称';
    if (!formData.name.trim()) newErrors.name = '请输入产品名称';
    if (!formData.quantity || parseFloat(formData.quantity) <= 0)
      newErrors.quantity = '请输入有效的数量';
    if (!formData.avgCost || parseFloat(formData.avgCost) < 0)
      newErrors.avgCost = '请输入有效的成本';
    if (!formData.currentPrice || parseFloat(formData.currentPrice) < 0)
      newErrors.currentPrice = '请输入有效的现值';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openAddModal = () => {
    if (accounts.length === 0) {
      setPriceUpdateToast({ success: 0, failed: 1 });
      return;
    }
    setEditingPosition(null);
    setFormData({ ...initialFormData, accountId: accounts[0].id });
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (position: Position) => {
    setEditingPosition(position);
    // 根据股票代码自动判断币种，或使用持仓已保存的币种
    const autoCurrency = position.currency || (() => {
      const upper = position.symbol.toUpperCase();
      if (/^\d{5}$/.test(upper)) return 'HKD';
      if (/^[0236]\d{5}$/.test(upper)) return 'CNY';
      if (/^5\d{5}$/.test(upper)) return 'CNY';
      if (/^[A-Z]{1,5}$/.test(upper)) return 'USD';
      return '';
    })();
    setFormData({
      accountId: position.accountId,
      assetType: position.assetType,
      symbol: position.symbol,
      name: position.name,
      currency: autoCurrency,
      quantity: position.quantity.toString(),
      avgCost: position.avgCost.toString(),
      currentPrice: position.currentPrice.toString(),
      buyDate: position.buyDate || position.createdAt.slice(0, 10),
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleDelete = () => {
    if (!editingPosition) return;
    if (!window.confirm(`确定删除持仓“${editingPosition.name}”吗？删除后不可恢复。`)) return;
    const result = deletePosition(editingPosition.id);
    if (result.success) {
      handleClose();
    }
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    if (editingPosition) {
      // Update existing position
      updatePosition(editingPosition.id, {
        accountId: formData.accountId,
        assetType: formData.assetType,
        symbol: formData.symbol.trim().toUpperCase(),
        name: formData.name.trim(),
        currency: formData.currency || undefined,
        quantity: parseFloat(formData.quantity),
        avgCost: parseFloat(formData.avgCost),
        currentPrice: parseFloat(formData.currentPrice),
        buyDate: formData.buyDate || undefined,
      });
    } else {
      // Add new position
      addPosition({
        accountId: formData.accountId,
        assetType: formData.assetType,
        symbol: formData.symbol.trim().toUpperCase(),
        name: formData.name.trim(),
        currency: formData.currency || undefined,
        quantity: parseFloat(formData.quantity),
        avgCost: parseFloat(formData.avgCost),
        currentPrice: parseFloat(formData.currentPrice),
        buyDate: formData.buyDate || undefined,
      });
    }

    setFormData(initialFormData);
    setErrors({});
    setEditingPosition(null);
    setIsModalOpen(false);
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setSymbolSuggestions([]);
    setShowSuggestions(false);
    setEditingPosition(null);
    setIsModalOpen(false);
    if (searchParams.get('new') === '1') {
      router.replace('/positions');
    }
  };

  const isBankProduct = (type: AssetType) =>
    type === 'bank_wealth_management' || type === 'bank_cash';

  const getSourceLabel = (assetType: AssetType) => {
    if (assetType === 'fund') return '基金净值';
    if (assetType === 'stock') return '实时行情';
    return '手动';
  };

  const DATA_TIER_META: Record<string, { label: string; color: string }> = {
    realtime: { label: '实时', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    estimate: { label: '盘中估值', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    confirmed: { label: '确认净值', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    cached: { label: '缓存', color: 'text-zinc-500 bg-zinc-50 border-zinc-200' },
    stale: { label: '已过期', color: 'text-red-500 bg-red-50 border-red-200' },
  };

  return (
    <div className="flex flex-col min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_24%),linear-gradient(to_bottom,#fafafa,#f8fafc)] text-zinc-900">
      {/* Price Update Toast */}
      {priceUpdateToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-xl bg-white/95 backdrop-blur border border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">更新成功 {priceUpdateToast.success}</span>
            </div>
            {priceUpdateToast.failed > 0 && (
              <div className="flex items-center gap-1.5 text-amber-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm">失败 {priceUpdateToast.failed}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="border-b border-white/60 bg-white/75 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.6),0_8px_30px_rgba(24,24,27,0.04)]">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">持仓总览</h1>
              {refreshStatus ? (
                <p className="mt-1 text-xs text-zinc-500">{refreshStatus}</p>
              ) : lastRefresh ? (
                <p className="mt-1 text-xs text-zinc-500">
                  上次更新: {formatBusinessDateTime(lastRefresh)}
                </p>
              ) : null}
              {positions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  <span className="text-zinc-500">
                    今日 <span className={`font-medium ${pnlStats.daily.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>{formatDualCurrency(Math.abs(pnlStats.daily.change), 'CNY')} ({formatPercent(pnlStats.daily.changePercent)})</span>
                  </span>
                  <span className="text-zinc-400">|</span>
                  <span className="text-zinc-500">
                    本月 <span className={`font-medium ${pnlStats.monthly.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>{formatDualCurrency(Math.abs(pnlStats.monthly.change), 'CNY')} ({formatPercent(pnlStats.monthly.changePercent)})</span>
                  </span>
                  <span className="text-zinc-400">|</span>
                  <span className="text-zinc-500">
                    今年 <span className={`font-medium ${pnlStats.yearly.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>{formatDualCurrency(Math.abs(pnlStats.yearly.change), 'CNY')} ({formatPercent(pnlStats.yearly.changePercent)})</span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || positions.length === 0}
                className="flex items-center gap-2 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded-lg text-sm text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="刷新全部价格"
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
                {isRefreshing ? '刷新中...' : '刷新全部'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {filterAccount && (
          <div className="mb-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回首页
            </Link>
            <span className="mx-2 text-zinc-300">|</span>
            <span className="text-sm text-zinc-700 font-medium">
              {filterAccount.name} 的持仓
            </span>
          </div>
        )}

        {filteredPositions.length === 0 ? (
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-700 mb-1">
              {filterAccount ? `暂无${filterAccount.name}的持仓` : '暂无持仓'}
            </h2>
            <p className="text-sm text-zinc-500">
              {filterAccount ? '点击右下角按钮添加该账户的持仓' : '点击右下角按钮添加您的第一笔持仓'}
            </p>
            {filterAccount && (
              <Link
                href="/positions"
                className="mt-4 text-sm text-blue-500 hover:text-blue-600"
              >
                查看全部持仓 →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPositions.map((position) => {
              const { pnlAmount, pnlPercent, currentValue, costBasis } = calculatePnL(position);
              const currency = getAccountCurrency(position.accountId);
              const assetConfig = ASSET_TYPE_CONFIG[position.assetType];
              const pnlColor = getPnLColor(pnlAmount);
              const isRefreshing = refreshingSymbols.has(position.symbol);
              const periodPnL = periodPnLMap.get(position.id) ?? { daily: 0, monthly: 0, yearly: 0 };

              return (
                <div
                  key={position.id}
                  className="bg-white/85 backdrop-blur border border-white/60 rounded-2xl p-4 shadow-[0_10px_30px_rgba(24,24,27,0.05)] hover:shadow-[0_16px_40px_rgba(24,24,27,0.08)] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/positions/${position.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-base font-medium text-zinc-900 truncate">
                          {position.name}
                        </h3>
                        <span className="text-xs text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                          {position.symbol}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border ${assetConfig.color}`}
                        >
                          {assetConfig.label}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500">{getAccountName(position.accountId)}</p>
                    </Link>

                    <div className="w-full max-w-[520px] flex items-center justify-end gap-3">
                      <div className="min-w-0 flex-1 flex flex-col items-end text-right">
                        <div className="flex items-center justify-end gap-1.5 mb-0.5">
                          <p className="text-base font-medium text-zinc-900">
                            {position.assetType === 'fund' 
                              ? formatPrice(position.currentPrice, position.assetType)
                              : formatNativeAmount(position.currentPrice, currency)}
                          </p>
                          {(() => {
                            const tierInfo = priceTierMap.get(position.id);
                            if (!tierInfo) return null;
                            const meta = DATA_TIER_META[tierInfo.tier];
                            if (!meta) return null;
                            return (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.color}`}>
                                {meta.label}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="w-full truncate text-[11px] text-zinc-400 leading-5">
                          数量 {position.quantity.toLocaleString('zh-CN')} · 总额 {formatNativeAmount(position.currentPrice * position.quantity, currency)}
                        </p>
                        <div className={`w-full flex flex-col items-end gap-0.5 text-sm ${pnlColor}`}>
                          <span>
                            {pnlAmount >= 0 ? '+' : '-'}{formatDualCurrency(Math.abs(pnlAmount), currency)}
                          </span>
                          <span className="text-xs">({formatPercent(pnlPercent)})</span>
                        </div>
                        {(() => {
                          const tierInfo = priceTierMap.get(position.id);
                          if (!tierInfo?.sourceLabel) return null;
                          return (
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              {tierInfo.sourceLabel}
                            </p>
                          );
                        })()}
                      </div>

                      {/* Individual refresh button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRefreshSingle(position);
                        }}
                        disabled={isRefreshing || isBankProduct(position.assetType)}
                        className={`p-2 rounded-lg transition-colors ${
                          isBankProduct(position.assetType)
                            ? 'text-zinc-300 cursor-not-allowed'
                            : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
                        } ${isRefreshing ? 'animate-spin' : ''}`}
                        title={
                          isBankProduct(position.assetType)
                            ? '银行产品需手动更新'
                            : `点击更新${getSourceLabel(position.assetType)}`
                        }
                      >
                        <svg
                          className="w-4 h-4"
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
                      </button>

                      {/* Edit button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditModal(position);
                        }}
                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="修改持仓"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Period P&L bar */}
                  {(periodPnL.daily !== 0 || periodPnL.monthly !== 0 || periodPnL.yearly !== 0) && (
                    <div className="mt-3 pt-3 border-t border-zinc-100 flex gap-6 text-xs">
                      <div>
                        <span className="text-zinc-400">今日 </span>
                        <span className={`font-medium ${periodPnL.daily >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {formatDualCurrency(Math.abs(periodPnL.daily), 'CNY')}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400">本月 </span>
                        <span className={`font-medium ${periodPnL.monthly >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {formatDualCurrency(Math.abs(periodPnL.monthly), 'CNY')}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400">今年 </span>
                        <span className={`font-medium ${periodPnL.yearly >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {formatDualCurrency(Math.abs(periodPnL.yearly), 'CNY')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <button
        onClick={openAddModal}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-400 text-white rounded-full shadow-lg shadow-blue-500/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="添加持仓"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="w-full max-w-lg bg-white border border-zinc-200 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white border-b border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900">
                {editingPosition ? '修改持仓' : '添加持仓'}
              </h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Account Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  账户 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer ${
                    errors.accountId ? 'border-red-500' : 'border-zinc-300'
                  }`}
                >
                  <option value="">选择账户</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({ACCOUNT_TYPE_LABELS[acc.type]})
                    </option>
                  ))}
                </select>
                {errors.accountId && (
                  <p className="mt-1 text-xs text-red-500">{errors.accountId}</p>
                )}
              </div>

              {/* Asset Type Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  资产类型 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ASSET_TYPES.map((type) => {
                    const config = ASSET_TYPE_CONFIG[type];
                    const isSelected = formData.assetType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleAssetTypeChange(type)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                          isSelected
                            ? `${config.color} border-current`
                            : 'bg-zinc-50 border-zinc-300 text-zinc-600 hover:border-zinc-400'
                        }`}
                      >
                        <span className="text-lg">{config.icon}</span>
                        <span className="text-xs font-medium">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Currency Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  币种 <span className="text-xs text-zinc-400">(留空则自动识别)</span>
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="">自动识别</option>
                  <option value="CNY">人民币 (CNY)</option>
                  <option value="HKD">港币 (HKD)</option>
                  <option value="USD">美元 (USD)</option>
                  <option value="EUR">欧元 (EUR)</option>
                  <option value="JPY">日元 (JPY)</option>
                  <option value="GBP">英镑 (GBP)</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  港股通购买港股时，建议选择 HKD 以便正确换算
                </p>
              </div>

              {/* Symbol Search with Autocomplete */}
              <div className="relative" ref={suggestionRef}>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  代码 / 名称 <span className="text-red-500">*</span>
                </label>
                <input
                  ref={symbolInputRef}
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    setFormData({ ...formData, symbol: value });
                    handleSymbolSearch(value);
                  }}
                  onFocus={() => {
                    if (symbolSuggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder={isBankProduct(formData.assetType) ? '如：招行理财季季宝' : '输入代码或名称搜索'}
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.symbol ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.symbol && (
                  <p className="mt-1 text-xs text-red-500">{errors.symbol}</p>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions && symbolSuggestions.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {symbolSuggestions.map((info) => (
                      <button
                        key={`${info.symbol}-${info.exchange}`}
                        type="button"
                        onClick={() => selectSuggestion(info)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-50 transition-colors text-left"
                      >
                        <div>
                          <span className="text-sm font-medium text-zinc-900">{info.name}</span>
                          <span className="ml-2 text-xs text-zinc-500">{info.symbol}</span>
                        </div>
                        <span className="text-xs text-zinc-500">{info.exchange}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Name Input (auto-filled but editable) */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  产品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="产品名称将自动填充，也可手动修改"
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.name ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  {isBankProduct(formData.assetType) ? '购买金额' : '持有数量'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step={isBankProduct(formData.assetType) ? '0.01' : '0.0001'}
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder={isBankProduct(formData.assetType) ? '例如: 100000' : '例如: 1000'}
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.quantity ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.quantity && (
                  <p className="mt-1 text-xs text-red-500">{errors.quantity}</p>
                )}
              </div>

              {/* Cost & Current Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    {isBankProduct(formData.assetType) ? '购买价格/净值' : '成本价'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.avgCost}
                    onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                    placeholder={isBankProduct(formData.assetType) ? '例如: 1.0000' : '例如: 12.50'}
                    className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.avgCost ? 'border-red-500' : 'border-zinc-300'
                    }`}
                  />
                  {errors.avgCost && (
                    <p className="mt-1 text-xs text-red-500">{errors.avgCost}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    {isBankProduct(formData.assetType) ? '当前价格/净值' : '当前价'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.currentPrice}
                    onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                    placeholder={isBankProduct(formData.assetType) ? '例如: 1.0234' : '例如: 13.80'}
                    className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.currentPrice ? 'border-red-500' : 'border-zinc-300'
                    }`}
                  />
                  {errors.currentPrice && (
                    <p className="mt-1 text-xs text-red-500">{errors.currentPrice}</p>
                  )}
                </div>
              </div>

              {/* Buy Date */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  买入日期 <span className="text-xs text-zinc-400">(选填，默认今天)</span>
                </label>
                <input
                  type="date"
                  value={formData.buyDate}
                  onChange={(e) => setFormData({ ...formData, buyDate: e.target.value })}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  记录最初买入的日期，用于计算各时点盈亏
                </p>
              </div>

              {/* Bank Product-specific fields */}
              {formData.assetType === 'bank_wealth_management' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-600 mb-2">💡 银行理财产品提示</p>
                  <ul className="text-xs text-zinc-600 space-y-1">
                    <li>• 净值型理财：输入购买时的净值和当前净值</li>
                    <li>• 预期收益型理财：成本填购买金额，现价填到期预计金额</li>
                    <li>• 部分银行理财可能没有实时净值，需手动更新</li>
                  </ul>
                </div>
              )}

              {formData.assetType === 'bank_cash' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-600 mb-2">💡 现金管理提示</p>
                  <ul className="text-xs text-zinc-600 space-y-1">
                    <li>• 银行活期存款：现价填当前余额</li>
                    <li>• 货币基金：净值通常为 1.xxxx</li>
                    <li>• 定期存款：现价填到期本息合计</li>
                  </ul>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 flex gap-3 px-5 py-4 bg-white border-t border-zinc-200">
              {editingPosition && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                >
                  删除持仓
                </button>
              )}
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-lg font-medium transition-colors"
              >
                {editingPosition ? '保存修改' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PositionsPage() {
  return (
    <Suspense fallback={null}>
      <PositionsPageContent />
    </Suspense>
  );
}
