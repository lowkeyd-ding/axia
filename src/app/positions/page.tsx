'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { refreshPrices, getPrice, type PriceData } from '@/lib/priceApi';
import { searchSymbols, type SymbolInfo } from '@/lib/symbolLookup';
import type { Position, Account, AssetType } from '@/types';
import { ASSET_TYPE_CONFIG } from '@/types';

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  brokerage: '券商',
  retirement: '养老',
  savings: '储蓄',
  cash: '现金',
};

const ASSET_TYPES: AssetType[] = ['stock', 'fund', 'bank_wealth_management', 'bank_cash'];

interface FormData {
  accountId: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  quantity: string;
  avgCost: string;
  currentPrice: string;
  expectedReturn?: string; // For bank_wealth_management
  maturityDate?: string; // For bank_wealth_management
}

const initialFormData: FormData = {
  accountId: '',
  assetType: 'stock',
  symbol: '',
  name: '',
  quantity: '',
  avgCost: '',
  currentPrice: '',
};

export default function PositionsPage() {
  const { positions, accounts, addPosition, updatePosition } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolInfo[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [refreshingSymbols, setRefreshingSymbols] = useState<Set<string>>(new Set());
  const [priceUpdateToast, setPriceUpdateToast] = useState<{ success: number; failed: number } | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const symbolInputRef = useRef<HTMLInputElement>(null);

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
      const symbols = [...new Set(positions.map((p) => p.symbol))];
      const result = await refreshPrices(symbols);

      if (result.success && result.prices) {
        result.prices.forEach((priceData) => {
          const position = positions.find((p) => p.symbol === priceData.symbol);
          if (position) {
            updatePosition(position.id, { currentPrice: priceData.price });
            successCount++;
          }
        });
        setLastRefresh(new Date());
      } else {
        failedCount = symbols.length;
      }
    } catch {
      failedCount = positions.length;
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
      const isFund = position.assetType === 'fund';
      const result = await getPrice(position.symbol);

      if (result) {
        updatePosition(position.id, { currentPrice: result.price });
        setPriceUpdateToast({ success: 1, failed: 0 });
      } else {
        setPriceUpdateToast({ success: 0, failed: 1 });
      }
    } catch {
      setPriceUpdateToast({ success: 0, failed: 1 });
    } finally {
      setRefreshingSymbols((prev) => {
        const next = new Set(prev);
        next.delete(position.symbol);
        return next;
      });
    }
  };

  const formatCurrency = (value: number, currency = 'CNY') => {
    const formatted = new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(value));
    return value < 0 ? `-${formatted}` : formatted;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
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
    return { pnlAmount, pnlPercent };
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

  const handleSubmit = () => {
    if (!validateForm()) return;

    addPosition({
      accountId: formData.accountId,
      assetType: formData.assetType,
      symbol: formData.symbol.trim().toUpperCase(),
      name: formData.name.trim(),
      quantity: parseFloat(formData.quantity),
      avgCost: parseFloat(formData.avgCost),
      currentPrice: parseFloat(formData.currentPrice),
    });

    setFormData(initialFormData);
    setErrors({});
    setIsModalOpen(false);
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setSymbolSuggestions([]);
    setShowSuggestions(false);
    setIsModalOpen(false);
  };

  const openAddModal = () => {
    if (accounts.length === 0) {
      alert('请先添加账户');
      return;
    }
    setFormData({ ...initialFormData, accountId: accounts[0].id });
    setIsModalOpen(true);
  };

  const getAssetTypeLabel = (type: AssetType) => ASSET_TYPE_CONFIG[type].label;

  const isBankProduct = (type: AssetType) =>
    type === 'bank_wealth_management' || type === 'bank_cash';

  const getSourceLabel = (assetType: AssetType) => {
    if (assetType === 'fund') return '基金净值';
    if (assetType === 'stock') return '实时行情';
    return '手动';
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
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

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">持仓明细</h1>
              {lastRefresh && (
                <p className="mt-1 text-xs text-zinc-500">
                  上次刷新: {lastRefresh.toLocaleTimeString('zh-CN')}
                </p>
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
        {positions.length === 0 ? (
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
            <h2 className="text-lg font-medium text-zinc-700 mb-1">暂无持仓</h2>
            <p className="text-sm text-zinc-500">点击右下角按钮添加您的第一笔持仓</p>
          </div>
        ) : (
          <div className="space-y-2">
            {positions.map((position) => {
              const { pnlAmount, pnlPercent } = calculatePnL(position);
              const currency = getAccountCurrency(position.accountId);
              const assetConfig = ASSET_TYPE_CONFIG[position.assetType];
              const pnlColor =
                pnlAmount > 0
                  ? 'text-blue-600'
                  : pnlAmount < 0
                    ? 'text-red-500'
                    : 'text-zinc-400';
              const isRefreshing = refreshingSymbols.has(position.symbol);

              return (
                <div
                  key={position.id}
                  className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-colors"
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

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-base font-medium text-zinc-900">
                          {formatCurrency(position.currentPrice, currency)}
                        </p>
                        <div className={`flex items-center justify-end gap-1.5 text-sm ${pnlColor}`}>
                          <span>{formatCurrency(pnlAmount, currency)}</span>
                          <span className="text-xs">({formatPercent(pnlPercent)})</span>
                        </div>
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
                    </div>
                  </div>
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
              <h2 className="text-lg font-semibold text-zinc-900">添加持仓</h2>
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
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
