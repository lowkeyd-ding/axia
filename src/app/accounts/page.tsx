'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { Account } from '@/types';
import * as XLSX from 'xlsx';
import { getExchangeRates, type ExchangeRates } from '@/lib/exchangeRates';

const ACCOUNT_TYPES = [
  { value: 'bank', label: '银行' },
  { value: 'securities', label: '证券' },
  { value: 'fund', label: '基金' },
  { value: 'other', label: '其他' },
] as const;

const CURRENCIES = ['CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP'];

const ACCOUNT_TYPE_COLORS: Record<Account['type'], string> = {
  bank: 'bg-blue-100 text-blue-600 border-blue-200',
  securities: 'bg-purple-100 text-purple-600 border-purple-200',
  fund: 'bg-green-100 text-green-600 border-green-200',
  other: 'bg-yellow-100 text-yellow-600 border-yellow-200',
};

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  bank: '银行',
  securities: '证券',
  fund: '基金',
  other: '其他',
};

// Default rates as fallback
const DEFAULT_RATES: ExchangeRates = {
  CNY: 1,
  HKD: 0.92,
  USD: 7.25,
  EUR: 7.85,
  JPY: 0.048,
  GBP: 9.15,
};

// 根据股票代码判断币种
const getSymbolCurrency = (symbol: string): string => {
  const upper = symbol.toUpperCase();
  if (/^\d{5}$/.test(upper)) return 'HKD';
  if (/^[0236]\d{5}$/.test(upper)) return 'CNY';
  if (/^5\d{5}$/.test(upper)) return 'CNY';
  if (/^[A-Z]{1,5}$/.test(upper)) return 'USD';
  return 'CNY';
};

interface FormData {
  name: string;
  type: Account['type'];
  institution: string;
  currency: string;
  holder: string;
  balance: string;
  accountId?: string; // For editing existing accounts
}

const initialFormData: FormData = {
  name: '',
  type: 'bank',
  institution: '',
  currency: 'CNY',
  holder: '',
  balance: '0',
};

export default function AccountsPage() {
  const { accounts, positions, addAccount, updateAccount, deleteAccount, addTransfer, transfers, exportData, importData } = useAppStore();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [currencyRates, setCurrencyRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [transferData, setTransferData] = useState({
    type: 'between_accounts' as 'between_accounts' | 'from_external' | 'to_external',
    fromAccountId: '',
    toAccountId: '',
    externalAccountName: '',
    amount: '',
    note: ''
  });
  const [transferError, setTransferError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch exchange rates on mount
  useEffect(() => {
    getExchangeRates().then(setCurrencyRates);
  }, []);

  const handleTransfer = () => {
    const { type, fromAccountId, toAccountId, externalAccountName, amount } = transferData;

    if (!amount || parseFloat(amount) <= 0) {
      setTransferError('金额必须大于0');
      return;
    }

    // 账户间转账：系统账户 -> 系统账户
    if (type === 'between_accounts') {
      if (!fromAccountId) {
        setTransferError('请选择转出账户');
        return;
      }
      if (!toAccountId) {
        setTransferError('请选择转入账户');
        return;
      }
      const result = addTransfer({
        fromAccountId,
        toAccountId,
        amount: parseFloat(amount),
        currency: accounts.find(a => a.id === fromAccountId)?.currency || 'CNY',
        note: externalAccountName || undefined,
      });

      if (result.success) {
        setToast({ type: 'success', message: '转账成功' });
        setIsTransferModalOpen(false);
        resetTransferForm();
      } else {
        setTransferError(result.error || '转账失败');
      }
      return;
    }

    // 向外部账户转出：系统账户 -> 外部
    if (type === 'to_external') {
      if (!fromAccountId) {
        setTransferError('请选择转出账户');
        return;
      }
      const result = addTransfer({
        fromAccountId,
        toAccountId: 'external',
        amount: parseFloat(amount),
        currency: accounts.find(a => a.id === fromAccountId)?.currency || 'CNY',
        note: externalAccountName || undefined,
      });

      if (result.success) {
        setToast({ type: 'success', message: '转出成功' });
        setIsTransferModalOpen(false);
        resetTransferForm();
      } else {
        setTransferError(result.error || '转出失败');
      }
      return;
    }

    // 从外部账户转入：外部 -> 系统账户
    if (type === 'from_external') {
      if (!toAccountId) {
        setTransferError('请选择转入账户');
        return;
      }
      if (!externalAccountName.trim()) {
        setTransferError('请输入资金来源');
        return;
      }
      const result = addTransfer({
        fromAccountId: 'external',
        toAccountId,
        amount: parseFloat(amount),
        currency: accounts.find(a => a.id === toAccountId)?.currency || 'CNY',
        note: externalAccountName,
      });

      if (result.success) {
        setToast({ type: 'success', message: '投入成功' });
        setIsTransferModalOpen(false);
        resetTransferForm();
      } else {
        setTransferError(result.error || '投入失败');
      }
      return;
    }
  };

  const resetTransferForm = () => {
    setTransferData({
      type: 'between_accounts',
      fromAccountId: '',
      toAccountId: '',
      externalAccountName: '',
      amount: '',
      note: ''
    });
    setTransferError('');
  };

  const handleDeleteAccount = (accountId: string, accountName: string) => {
    const accountPositions = positions.filter(p => p.accountId === accountId);
    const confirmMessage = accountPositions.length > 0
      ? `确定要删除账户"${accountName}"吗？\n该账户下有 ${accountPositions.length} 个持仓，删除账户将同时删除所有关联持仓。`
      : `确定要删除账户"${accountName}"吗？`;

    if (confirm(confirmMessage)) {
      const result = deleteAccount(accountId);
      if (result.success) {
        setToast({ type: 'success', message: '账户已删除' });
      } else {
        setToast({ type: 'error', message: result.error || '删除失败' });
      }
    }
  };

  const toggleAccount = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  const getAccountValue = (accountId: string) => {
    const accountPositions = positions.filter((p) => p.accountId === accountId);
    const account = accounts.find((a) => a.id === accountId);
    const accountCurrency = account?.currency || 'CNY';
    const accountRate = currencyRates[accountCurrency] ?? 1;

    return accountPositions.reduce((sum, p) => {
      // 优先使用持仓自己的币种，否则使用账户币种
      const positionCurrency = p.currency || accountCurrency;
      const rate = currencyRates[positionCurrency] ?? 1;
      return sum + p.currentPrice * p.quantity * rate;
    }, 0);
  };

  const getAccountBalanceCNY = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return 0;
    const rate = currencyRates[account.currency] ?? 1;
    return account.balance * rate;
  };

  const getAccountPositions = (accountId: string) => {
    return positions.filter((p) => p.accountId === accountId);
  };

  const getPositionValueCNY = (position: { currency?: string; currentPrice: number; quantity: number; accountId: string }) => {
    const account = accounts.find((a) => a.id === position.accountId);
    const accountCurrency = account?.currency || 'CNY';
    const positionCurrency = position.currency || accountCurrency;
    const rate = currencyRates[positionCurrency] ?? 1;
    return position.currentPrice * position.quantity * rate;
  };

  const getPositionPnL = (position: { currency?: string; currentPrice: number; avgCost: number; quantity: number; accountId: string }) => {
    const account = accounts.find((a) => a.id === position.accountId);
    const accountCurrency = account?.currency || 'CNY';
    const positionCurrency = position.currency || accountCurrency;
    const rate = currencyRates[positionCurrency] ?? 1;
    const pnl = (position.currentPrice - position.avgCost) * position.quantity * rate;
    const pnlPercent = position.avgCost > 0 ? ((position.currentPrice - position.avgCost) / position.avgCost) * 100 : 0;
    return { pnl, pnlPercent };
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  // Data export handler - exports to Excel with multiple sheets
  const handleExport = (format: 'excel' | 'json' = 'excel') => {
    const { accounts, positions, trades, transfers, snapshots } = useAppStore.getState();

    if (format === 'json') {
      const jsonData = exportData();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `axia-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ type: 'success', message: '数据已导出 (JSON格式)' });
      return;
    }

    // Export to Excel
    const wb = XLSX.utils.book_new();

    // 账户数据
    if (accounts.length > 0) {
      const accountsData = accounts.map(a => ({
        '账户名称': a.name,
        '类型': ACCOUNT_TYPE_LABELS[a.type],
        '机构': a.institution || '',
        '持有人': a.holder || '',
        '余额': a.balance,
        '币种': a.currency,
        '创建时间': a.createdAt,
        '更新时间': a.updatedAt,
      }));
      const wsAccounts = XLSX.utils.json_to_sheet(accountsData);
      XLSX.utils.book_append_sheet(wb, wsAccounts, '账户');
    }

    // 持仓数据
    if (positions.length > 0) {
      const positionsData = positions.map(p => ({
        '持仓名称': p.name,
        '代码': p.symbol,
        '类型': p.assetType,
        '数量': p.quantity,
        '成本价': p.avgCost,
        '当前价': p.currentPrice,
        '币种': p.currency || '',
        '所属账户ID': p.accountId,
        '创建时间': p.createdAt,
        '更新时间': p.updatedAt,
      }));
      const wsPositions = XLSX.utils.json_to_sheet(positionsData);
      XLSX.utils.book_append_sheet(wb, wsPositions, '持仓');
    }

    // 交易记录
    if (trades.length > 0) {
      const tradesData = trades.map(t => ({
        '时间': t.executedAt,
        '类型': t.type === 'buy' ? '买入' : '卖出',
        '名称': t.name,
        '代码': t.symbol,
        '数量': t.quantity,
        '价格': t.price,
        '总额': t.total,
        '手续费': t.fees,
        '账户ID': t.accountId,
      }));
      const wsTrades = XLSX.utils.json_to_sheet(tradesData);
      XLSX.utils.book_append_sheet(wb, wsTrades, '交易记录');
    }

    // 资金转账
    if (transfers.length > 0) {
      const transfersData = transfers.map(t => ({
        '时间': t.createdAt,
        '转出账户': t.fromAccountId === 'external' ? '外部账户' : t.fromAccountId,
        '转入账户': t.toAccountId === 'external' ? '外部账户' : t.toAccountId,
        '金额': t.amount,
        '币种': t.currency,
        '备注': t.note || '',
      }));
      const wsTransfers = XLSX.utils.json_to_sheet(transfersData);
      XLSX.utils.book_append_sheet(wb, wsTransfers, '资金转账');
    }

    // 快照记录
    if (snapshots.length > 0) {
      const snapshotsData = snapshots.map(s => ({
        '日期': s.date,
        '总价值': s.totalValue,
        '现金': s.cash,
        '投资': s.investments,
        '日变化': s.dailyChange,
        '日变化率': `${s.dailyChangePercent.toFixed(2)}%`,
        '累计变化': s.totalChange,
        '累计变化率': `${s.totalChangePercent.toFixed(2)}%`,
        '备注': s.note || '',
        '创建时间': s.createdAt,
      }));
      const wsSnapshots = XLSX.utils.json_to_sheet(snapshotsData);
      XLSX.utils.book_append_sheet(wb, wsSnapshots, '快照记录');
    }

    // 生成Excel文件
    XLSX.writeFile(wb, `axia-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setToast({ type: 'success', message: '数据已导出 (Excel格式)' });
  };

  // Data import handler
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel) {
      // Excel导入
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });

          // 读取各工作表数据
          let importedAccounts: any[] = [];
          let importedPositions: any[] = [];
          let importedTrades: any[] = [];
          let importedTransfers: any[] = [];

          wb.SheetNames.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(ws);

            if (sheetName === '账户') {
              importedAccounts = jsonData;
            } else if (sheetName === '持仓') {
              importedPositions = jsonData;
            } else if (sheetName === '交易记录') {
              importedTrades = jsonData;
            } else if (sheetName === '资金转账') {
              importedTransfers = jsonData;
            }
          });

          // 转换并导入数据
          const result = importData(JSON.stringify({
            data: {
              accounts: importedAccounts,
              positions: importedPositions,
              trades: importedTrades,
              transfers: importedTransfers,
              snapshots: [],
              targetAllocations: [],
            }
          }));

          if (result.success) {
            setToast({ type: 'success', message: `已导入 ${importedAccounts.length} 个账户等数据` });
            setIsDataModalOpen(false);
          } else {
            setToast({ type: 'error', message: result.message });
          }
        } catch (error) {
          setToast({ type: 'error', message: '读取Excel文件失败' });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // JSON导入
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const result = importData(content);
        if (result.success) {
          setToast({ type: 'success', message: result.message });
          setIsDataModalOpen(false);
        } else {
          setToast({ type: 'error', message: result.message });
        }
      };
      reader.onerror = () => {
        setToast({ type: 'error', message: '读取文件失败' });
      };
      reader.readAsText(file);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

    if (editingAccountId) {
      updateAccount(editingAccountId, {
        name: formData.name.trim(),
        type: formData.type,
        institution: formData.institution.trim(),
        currency: formData.currency,
        holder: formData.holder.trim(),
        balance: parseFloat(formData.balance) || 0,
      });
      setEditingAccountId(null);
    } else {
      addAccount({
        name: formData.name.trim(),
        type: formData.type,
        institution: formData.institution.trim(),
        currency: formData.currency,
        holder: formData.holder.trim(),
        balance: parseFloat(formData.balance) || 0,
      });
    }

    setFormData(initialFormData);
    setErrors({});
    setIsModalOpen(false);
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setEditingAccountId(null);
    setIsModalOpen(false);
  };

  const totalValueCNY = accounts.reduce((sum, acc) => {
    const value = getAccountValue(acc.id);
    const rate = currencyRates[acc.currency] ?? 1;
    return sum + value * rate;
  }, 0);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">我的账户</h1>
              {accounts.length > 0 && (
                <p className="mt-1 text-sm text-zinc-500">
                  共 {accounts.length} 个账户，持仓总市值（CNY）{' '}
                  <span className="text-blue-600 font-medium">{formatCNY(totalValueCNY)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                title="资金转账"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                转账
              </button>
              <button
                onClick={() => setIsDataModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                数据管理
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-xl ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

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
              const balanceCNY = getAccountBalanceCNY(account.id);
              const typeColor = ACCOUNT_TYPE_COLORS[account.type];
              const typeLabel = ACCOUNT_TYPE_LABELS[account.type];
              // 总资产 = 持仓市值折CNY + 余额折CNY
              const totalAssets = value + balanceCNY;
              const accountPositions = getAccountPositions(account.id);
              const isExpanded = expandedAccounts.has(account.id);

              return (
                <div
                  key={account.id}
                  className="bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-colors"
                >
                  {/* Clickable header */}
                  <button
                    onClick={() => toggleAccount(account.id)}
                    className="w-full p-4 flex items-center justify-between text-left"
                  >
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
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-semibold text-zinc-900">
                          {formatCNY(totalAssets)}
                        </p>
                        <div className="flex items-center justify-end gap-2 text-xs">
                          <span className="text-zinc-400">
                            持仓: {formatCNY(value)}
                          </span>
                          <span className="text-zinc-300">|</span>
                          <span className="text-blue-500/80">
                            余额: {formatCNY(balanceCNY)}
                          </span>
                        </div>
                      </div>
                      {/* Expand indicator */}
                      <svg
                        className={`w-5 h-5 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      {/* Edit button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAccountId(account.id);
                          setFormData({
                            name: account.name,
                            type: account.type,
                            currency: account.currency,
                            balance: account.balance.toString(),
                            institution: account.institution || '',
                            holder: account.holder || '',
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="编辑账户"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAccount(account.id, account.name);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除账户"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </button>

                  {/* Expanded positions list */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 bg-zinc-50">
                      {accountPositions.length > 0 ? (
                        <div className="divide-y divide-zinc-100">
                          {accountPositions.map((position) => {
                            const positionValueCNY = getPositionValueCNY(position);
                            const { pnl, pnlPercent } = getPositionPnL(position);
                            const pnlColor = pnl >= 0 ? 'text-red-500' : 'text-green-600';
                            const positionCurrency = position.currency || getSymbolCurrency(position.symbol);
                            const displayCurrency = positionCurrency === 'CNY' ? account.currency : positionCurrency;

                            return (
                              <div key={position.id} className="px-4 py-3 flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-zinc-900 truncate">
                                    {position.name}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {position.symbol} · {position.quantity}股{positionCurrency !== account.currency && ` · ${positionCurrency}`}
                                  </p>
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-sm font-medium text-zinc-900">
                                    {formatCurrency(positionValueCNY, 'CNY')}
                                  </p>
                                  <p className={`text-xs ${pnlColor}`}>
                                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, 'CNY')} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-center text-sm text-zinc-500">
                          暂无持仓
                        </div>
                      )}
                    </div>
                  )}
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
              <h2 className="text-lg font-semibold text-zinc-900">{editingAccountId ? '编辑账户' : '添加账户'}</h2>
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
                {editingAccountId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Management Modal */}
      {isDataModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setIsDataModalOpen(false)}
        >
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900">数据管理</h2>
              <button
                onClick={() => setIsDataModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-zinc-500">
                将当前数据导出为 Excel 或 JSON 格式，或从备份文件导入数据。
              </p>

              {/* Export Section */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-900">导出数据</h3>
                    <p className="text-xs text-zinc-500">将账户、持仓、交易等数据导出</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport('excel')}
                    className="flex-1 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    导出 Excel
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    导出 JSON
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-900">导入数据</h3>
                    <p className="text-xs text-zinc-500">从备份文件恢复数据（将覆盖现有数据）</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  id="import-file"
                />
                <label
                  htmlFor="import-file"
                  className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  选择 Excel/JSON 文件
                </label>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-amber-700">
                  导入数据会<strong>完全覆盖</strong>现有数据，请在导入前确认已做好备份。
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-zinc-200">
              <button
                onClick={() => setIsDataModalOpen(false)}
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setIsTransferModalOpen(false)}
        >
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900">资金转账</h2>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {transferError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {transferError}
                </div>
              )}

              {/* Transfer Type Tabs */}
              <div className="flex rounded-lg bg-zinc-100 p-1">
                <button
                  onClick={() => setTransferData({ ...transferData, type: 'between_accounts' })}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    transferData.type === 'between_accounts'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  账户转账
                </button>
                <button
                  onClick={() => setTransferData({ ...transferData, type: 'from_external' })}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    transferData.type === 'from_external'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  资金投入
                </button>
                <button
                  onClick={() => setTransferData({ ...transferData, type: 'to_external' })}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    transferData.type === 'to_external'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  资金转出
                </button>
              </div>

              {/* 账户间转账 */}
              {transferData.type === 'between_accounts' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">转出账户</label>
                    <select
                      value={transferData.fromAccountId}
                      onChange={(e) => setTransferData({ ...transferData, fromAccountId: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">请选择转出账户</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - 余额 {formatCurrency(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">转入账户</label>
                    <select
                      value={transferData.toAccountId}
                      onChange={(e) => setTransferData({ ...transferData, toAccountId: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">请选择转入账户</option>
                      {accounts.filter((acc) => acc.id !== transferData.fromAccountId).map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - 余额 {formatCurrency(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">转账金额</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={transferData.amount}
                      onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
                      placeholder="请输入转账金额"
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              {/* 资金投入：外部 -> 系统账户 */}
              {transferData.type === 'from_external' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">资金来源</label>
                    <input
                      type="text"
                      value={transferData.externalAccountName}
                      onChange={(e) => setTransferData({ ...transferData, externalAccountName: e.target.value })}
                      placeholder="如：工资卡、父母给的"
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">投入至账户</label>
                    <select
                      value={transferData.toAccountId}
                      onChange={(e) => setTransferData({ ...transferData, toAccountId: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">请选择账户</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - 余额 {formatCurrency(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">投入金额</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={transferData.amount}
                      onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
                      placeholder="请输入投入金额"
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              {/* 资金转出：系统账户 -> 外部 */}
              {transferData.type === 'to_external' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">转出账户</label>
                    <select
                      value={transferData.fromAccountId}
                      onChange={(e) => setTransferData({ ...transferData, fromAccountId: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">请选择账户</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - 余额 {formatCurrency(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">资金去向</label>
                    <input
                      type="text"
                      value={transferData.externalAccountName}
                      onChange={(e) => setTransferData({ ...transferData, externalAccountName: e.target.value })}
                      placeholder="如：生活费、购房款"
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">转出金额</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={transferData.amount}
                      onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
                      placeholder="请输入转出金额"
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">备注（可选）</label>
                <input
                  type="text"
                  value={transferData.note}
                  onChange={(e) => setTransferData({ ...transferData, note: e.target.value })}
                  placeholder="如：月份、用途等"
                  className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-zinc-200 flex gap-3">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="flex-1 px-4 py-2.5 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleTransfer}
                className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                {transferData.type === 'between_accounts' ? '确认转账' : transferData.type === 'from_external' ? '确认投入' : '确认转出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
