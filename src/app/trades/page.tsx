'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { searchSymbols, type SymbolInfo } from '@/lib/symbolLookup';
import type { Account, AssetType } from '@/types';
import { ASSET_TYPE_CONFIG } from '@/types';
import { formatFeeDisplay, tradeCashWithFees } from '@/lib/tradeFees';
import { formatCurrency } from '@/utils/format';

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
  type: 'buy' | 'sell';
  quantity: string;
  price: string;
  fees: string;
  executedAt: string;
}

const initialFormData: FormData = {
  accountId: '',
  assetType: 'stock',
  symbol: '',
  name: '',
  type: 'buy',
  quantity: '',
  price: '',
  fees: '0',
  executedAt: new Date().toISOString().slice(0, 16),
};

export default function TradesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { trades, accounts, positions, executeTrade } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolInfo[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tradeResult, setTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

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

  // Clear result after 3 seconds
  useEffect(() => {
    if (tradeResult) {
      const timer = setTimeout(() => setTradeResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [tradeResult]);

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

  const getAccountBalance = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.balance ?? 0;
  };

  const getAccountCurrency = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.currency ?? 'CNY';
  };

  const getPositionQuantity = (accountId: string, symbol: string, assetType: AssetType) => {
    const position = positions.find(
      (p) => p.accountId === accountId && p.symbol === symbol && p.assetType === assetType
    );
    return position?.quantity ?? 0;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.accountId) newErrors.accountId = '请选择账户';
    if (!formData.symbol.trim()) newErrors.symbol = '请输入代码或名称';
    if (!formData.name.trim()) newErrors.name = '请输入产品名称';
    if (!formData.quantity || parseFloat(formData.quantity) <= 0)
      newErrors.quantity = '请输入有效的数量';
    if (!formData.price || parseFloat(formData.price) < 0)
      newErrors.price = '请输入有效的价格';
    if (parseFloat(formData.fees) < 0)
      newErrors.fees = '手续费不能为负数';
    if (!formData.executedAt) newErrors.executedAt = '请选择交易时间';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const quantity = parseFloat(formData.quantity);
    const price = parseFloat(formData.price);
    const fees = parseFloat(formData.fees || '0');
    const total = quantity * price;
    const currency = getAccountCurrency(formData.accountId);

    // Calculate preview
    const previewTotal = total + fees;

    if (formData.type === 'buy') {
      const balance = getAccountBalance(formData.accountId);
      if (previewTotal > balance) {
        setErrors({ ...errors, quantity: `余额不足，需要 ${formatCurrency(previewTotal, currency)}，当前可用 ${formatCurrency(balance, currency)}` });
        return;
      }
    } else {
      const available = getPositionQuantity(formData.accountId, formData.symbol, formData.assetType);
      if (quantity > available) {
        setErrors({ ...errors, quantity: `持仓不足，当前持有 ${available}，需要卖出 ${quantity}` });
        return;
      }
    }

    const result = executeTrade({
      accountId: formData.accountId,
      assetType: formData.assetType,
      symbol: formData.symbol.trim().toUpperCase(),
      name: formData.name.trim(),
      type: formData.type,
      quantity,
      price,
      total,
      fees,
      executedAt: new Date(formData.executedAt).toISOString(),
    });

    if (result.success) {
      setTradeResult({ success: true, message: `${formData.type === 'buy' ? '买入' : '卖出'}成功！` });
      setFormData(initialFormData);
      setErrors({});
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      setIsModalOpen(false);
    } else {
      setTradeResult({ success: false, message: result.error || '交易失败' });
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setSymbolSuggestions([]);
    setShowSuggestions(false);
    setIsModalOpen(false);
    if (searchParams.get('new') === '1') router.replace('/trades');
  };

  const openAddModal = (type: 'buy' | 'sell' = 'buy') => {
    if (accounts.length === 0) {
      setTradeResult({ success: false, message: '请先添加账户' });
      return;
    }
    setFormData({ ...initialFormData, accountId: accounts[0].id, type });
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openAddModal('buy');
    }
  }, [searchParams]);

  const isBankProduct = (type: AssetType) =>
    type === 'bank_wealth_management' || type === 'bank_cash';

  const currency = formData.accountId ? getAccountCurrency(formData.accountId) : 'CNY';
  const balance = formData.accountId ? getAccountBalance(formData.accountId) : 0;
  const availableQuantity = formData.accountId && formData.symbol
    ? getPositionQuantity(formData.accountId, formData.symbol, formData.assetType)
    : 0;
  const calculatedTotal = (parseFloat(formData.quantity) || 0) * (parseFloat(formData.price) || 0);
  const calculatedFees = parseFloat(formData.fees) || 0;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">交易记录</h1>
              <p className="mt-1 text-sm text-zinc-500">
                共 {trades.length} 笔交易
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => openAddModal('buy')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                买入
              </button>
              <button
                onClick={() => openAddModal('sell')}
                className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 border border-red-200 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                卖出
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Result Toast */}
      {tradeResult && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-xl ${
          tradeResult.success
            ? 'bg-blue-500/90 text-white'
            : 'bg-red-500/90 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {tradeResult.success ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">{tradeResult.message}</span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {trades.length === 0 ? (
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
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-700 mb-1">暂无交易记录</h2>
            <p className="text-sm text-zinc-500">点击上方按钮记录您的第一笔交易</p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map((trade) => {
              const assetConfig = ASSET_TYPE_CONFIG[trade.assetType];
              const isBuy = trade.type === 'buy';
              const currency = getAccountCurrency(trade.accountId);
              const feeDisplay = formatFeeDisplay(trade);
              const cashWithFees = tradeCashWithFees(trade);

              return (
                <div
                  key={trade.id}
                  className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          isBuy ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-500'
                        }`}>
                          {isBuy ? '买入' : '卖出'}
                        </span>
                        <h3 className="text-base font-medium text-zinc-900 truncate">
                          {trade.name}
                        </h3>
                        <span className="text-xs text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                          {trade.symbol}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${assetConfig.color}`}>
                          {assetConfig.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
                        <span>{formatDate(trade.executedAt)}</span>
                        <span className="text-zinc-400">|</span>
                        <span>{trade.quantity} @ {formatCurrency(trade.price, getAccountCurrency(trade.accountId))}</span>
                      </div>
                    </div>

                    <div className="text-right ml-4 space-y-0.5">
                      <p className={`text-base font-medium ${isBuy ? 'text-blue-600' : 'text-red-500'}`}>
                        {isBuy ? '买入' : '卖出'} · {formatCurrency(trade.total, currency)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        已记录费用：{feeDisplay.amount != null && feeDisplay.amount > 0 ? formatCurrency(feeDisplay.amount, currency) : feeDisplay.label}
                      </p>
                      <p className="text-xs font-medium text-zinc-700">
                        {isBuy ? '含费总支出' : '扣费后收入'}：{formatCurrency(cashWithFees, currency)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="w-full max-w-lg bg-white border border-zinc-200 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white border-b border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900">
                {formData.type === 'buy' ? '买入' : '卖出'}
              </h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Buy/Sell Toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'buy' })}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                    formData.type === 'buy'
                      ? 'bg-blue-500 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  买入
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'sell' })}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                    formData.type === 'sell'
                      ? 'bg-red-500 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  卖出
                </button>
              </div>

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
                      {acc.name} ({ACCOUNT_TYPE_LABELS[acc.type]}) - 余额: {formatCurrency(acc.balance, acc.currency)}
                    </option>
                  ))}
                </select>
                {errors.accountId && (
                  <p className="mt-1 text-xs text-red-500">{errors.accountId}</p>
                )}
              </div>

              {/* Balance Info */}
              {formData.accountId && (
                <div className={`p-3 rounded-lg border ${
                  formData.type === 'buy'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">
                      {formData.type === 'buy' ? '可用余额' : '可卖数量'}
                    </span>
                    <span className={`font-medium ${
                      formData.type === 'buy' ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {formData.type === 'buy'
                        ? formatCurrency(balance, currency)
                        : availableQuantity.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Asset Type Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  资产类型 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {ASSET_TYPES.map((type) => {
                    const config = ASSET_TYPE_CONFIG[type];
                    const isSelected = formData.assetType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleAssetTypeChange(type)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-xs ${
                          isSelected
                            ? `${config.color} border-current`
                            : 'bg-zinc-50 border-zinc-300 text-zinc-600 hover:border-zinc-400'
                        }`}
                      >
                        <span>{config.icon}</span>
                        <span className="font-medium">{config.label}</span>
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

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  产品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="产品名称将自动填充"
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.name ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Quantity & Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    {isBankProduct(formData.assetType) ? '购买份额/金额' : '数量'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step={isBankProduct(formData.assetType) ? '0.01' : '0.0001'}
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="0"
                    className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.quantity ? 'border-red-500' : 'border-zinc-300'
                    }`}
                  />
                  {errors.quantity && (
                    <p className="mt-1 text-xs text-red-500">{errors.quantity}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    单价 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.price ? 'border-red-500' : 'border-zinc-300'
                    }`}
                  />
                  {errors.price && (
                    <p className="mt-1 text-xs text-red-500">{errors.price}</p>
                  )}
                </div>
              </div>

              {/* Fees */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  手续费
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fees}
                  onChange={(e) => setFormData({ ...formData, fees: e.target.value })}
                  placeholder="未填写"
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <p className="mt-1.5 text-xs text-zinc-500">请按实际账单填写；未填写时不会自动估算。无法区分费用类型时统一记录为已记录费用。</p>
              </div>

              {/* Trade Time */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  交易时间 <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.executedAt}
                  onChange={(e) => setFormData({ ...formData, executedAt: e.target.value })}
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.executedAt ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.executedAt && (
                  <p className="mt-1 text-xs text-red-500">{errors.executedAt}</p>
                )}
              </div>

              {/* Summary */}
              {formData.quantity && formData.price && (
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">交易金额</span>
                    <span className="text-zinc-900">{formatCurrency(calculatedTotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">手续费</span>
                    <span className="text-zinc-900">{formatCurrency(calculatedFees, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-zinc-200">
                    <span className="text-zinc-700 font-medium">合计{formData.type === 'buy' ? '支出' : '收入'}</span>
                    <span className={`font-semibold ${
                      formData.type === 'buy' ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {formData.type === 'buy' ? '-' : '+'}{formatCurrency(calculatedTotal + calculatedFees, currency)}
                    </span>
                  </div>
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
                className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium transition-colors ${
                  formData.type === 'buy'
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                确认{formData.type === 'buy' ? '买入' : '卖出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
