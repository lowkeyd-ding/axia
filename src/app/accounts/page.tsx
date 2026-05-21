'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { Account } from '@/types';

const ACCOUNT_TYPES = [
  { value: 'brokerage', label: '券商' },
  { value: 'retirement', label: '养老' },
  { value: 'savings', label: '储蓄' },
  { value: 'cash', label: '现金' },
] as const;

const CURRENCIES = ['CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP'];

const ACCOUNT_TYPE_COLORS: Record<Account['type'], string> = {
  brokerage: 'bg-blue-100 text-blue-600 border-blue-200',
  retirement: 'bg-purple-100 text-purple-600 border-purple-200',
  savings: 'bg-green-100 text-green-600 border-green-200',
  cash: 'bg-yellow-100 text-yellow-600 border-yellow-200',
};

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  brokerage: '券商',
  retirement: '养老',
  savings: '储蓄',
  cash: '现金',
};

interface FormData {
  name: string;
  type: Account['type'];
  institution: string;
  currency: string;
  holder: string;
  balance: string;
}

const initialFormData: FormData = {
  name: '',
  type: 'brokerage',
  institution: '',
  currency: 'CNY',
  holder: '',
  balance: '0',
};

export default function AccountsPage() {
  const { accounts, positions, addAccount } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const getAccountValue = (accountId: string) => {
    const accountPositions = positions.filter((p) => p.accountId === accountId);
    return accountPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatCNY = (value: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.name.trim()) newErrors.name = '请输入账户名称';
    if (!formData.institution.trim()) newErrors.institution = '请输入机构名称';
    if (!formData.holder.trim()) newErrors.holder = '请输入持有人';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    addAccount({
      name: formData.name.trim(),
      type: formData.type,
      institution: formData.institution.trim(),
      currency: formData.currency,
      holder: formData.holder.trim(),
      balance: parseFloat(formData.balance) || 0,
    });

    setFormData(initialFormData);
    setErrors({});
    setIsModalOpen(false);
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setIsModalOpen(false);
  };

  const totalValueCNY = accounts.reduce((sum, acc) => {
    const value = getAccountValue(acc.id);
    if (acc.currency === 'CNY') return sum + value;
    if (acc.currency === 'USD') return sum + value * 7.2;
    if (acc.currency === 'HKD') return sum + value * 0.92;
    if (acc.currency === 'EUR') return sum + value * 7.8;
    if (acc.currency === 'JPY') return sum + value * 0.048;
    if (acc.currency === 'GBP') return sum + value * 9.1;
    return sum + value;
  }, 0);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">我的账户</h1>
          {accounts.length > 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              共 {accounts.length} 个账户，折CNY总市值{' '}
              <span className="text-blue-600 font-medium">{formatCNY(totalValueCNY)}</span>
            </p>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {accounts.length === 0 ? (
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
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-700 mb-1">暂无账户</h2>
            <p className="text-sm text-zinc-500 mb-6">点击右下角按钮添加您的第一个账户</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {accounts.map((account) => {
              const value = getAccountValue(account.id);
              const typeColor = ACCOUNT_TYPE_COLORS[account.type];
              const typeLabel = ACCOUNT_TYPE_LABELS[account.type];
              const totalAssets = value + account.balance;

              return (
                <div
                  key={account.id}
                  className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-base font-medium text-zinc-900 truncate">
                          {account.name}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${typeColor}`}
                        >
                          {typeLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
                        {account.institution && (
                          <span className="flex items-center gap-1.5">
                            <svg
                              className="w-3.5 h-3.5 text-zinc-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                              />
                            </svg>
                            {account.institution}
                          </span>
                        )}
                        {account.holder && (
                          <span className="flex items-center gap-1.5">
                            <svg
                              className="w-3.5 h-3.5 text-zinc-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            {account.holder}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <svg
                            className="w-3.5 h-3.5 text-zinc-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {account.currency}
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-4 space-y-1">
                      <p className="text-lg font-semibold text-zinc-900">
                        {formatCurrency(totalAssets, account.currency)}
                      </p>
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <span className="text-zinc-400">
                          持仓: {formatCurrency(value, account.currency)}
                        </span>
                        <span className="text-zinc-300">|</span>
                        <span className="text-blue-500/80">
                          余额: {formatCurrency(account.balance, account.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-400 text-white rounded-full shadow-lg shadow-blue-500/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="添加账户"
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
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900">添加账户</h2>
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

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：我的证券账户"
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.name ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as Account['type'] })
                  }
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  机构 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  placeholder="例如：招商证券"
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.institution ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.institution && (
                  <p className="mt-1 text-xs text-red-500">{errors.institution}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  币种 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  持有人 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.holder}
                  onChange={(e) => setFormData({ ...formData, holder: e.target.value })}
                  placeholder="例如：张三"
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.holder ? 'border-red-500' : 'border-zinc-300'
                  }`}
                />
                {errors.holder && (
                  <p className="mt-1 text-xs text-red-500">{errors.holder}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  初始余额
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <p className="mt-1 text-xs text-zinc-500">账户的初始可用资金余额</p>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-zinc-200">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
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
