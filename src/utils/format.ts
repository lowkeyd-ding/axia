/**
 * 共享格式化工具函数
 */

import { SUPPORTED_CURRENCIES } from '@/config/exchangeRates';

export function getCurrencyPrefix(currency: string): string {
  const symbols: Record<string, string> = {
    CNY: '¥',
    HKD: 'HK$',
    USD: '$',
    EUR: '€',
    JPY: '¥',
    GBP: '£',
  };
  return symbols[currency] || currency;
}

export function formatCurrency(
  value: number,
  currency = 'CNY',
  options: { showSign?: boolean; sign?: '+' | '-' } = {}
): string {
  const { showSign = false } = options;
  const absValue = Math.abs(value);

  const formatted = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue);

  if (showSign && value !== 0) {
    return value >= 0 ? `+${formatted}` : formatted;
  }

  return formatted;
}

export function formatDualCurrency(
  value: number,
  currency: string,
  cnyValue?: number
): string {
  if (!currency || cnyValue == null) return formatCurrency(value, currency);
  if (currency === 'CNY') return formatCurrency(cnyValue, 'CNY');
  return `${formatCurrency(cnyValue, 'CNY')}（原币 ${formatNumber(value)} ${currency}）`;
}

export function formatPercent(value: number, showSign = true): string {
  const sign = value >= 0 ? '+' : '';
  return showSign ? `${sign}${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(value: number, currency = 'CNY'): string {
  return formatCurrency(value, currency);
}

export function getCurrencySymbol(currency: string): string {
  return getCurrencyPrefix(currency);
}

export function isValidCurrency(currency: string): currency is typeof SUPPORTED_CURRENCIES[number] {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}

export function formatDateTime(dateStr: string, options: { year?: boolean; month?: boolean; day?: boolean; hour?: boolean; minute?: boolean; } = {}): string {
  const { year = true, month = true, day = true, hour = false, minute = false } = options;
  const date = new Date(dateStr);
  const parts: string[] = [];
  if (year) parts.push(date.getFullYear().toString());
  if (month) parts.push(String(date.getMonth() + 1).padStart(2, '0'));
  if (day) parts.push(String(date.getDate()).padStart(2, '0'));
  const result = parts.join('-');
  if (hour || minute) {
    const timeParts: string[] = [];
    if (hour) timeParts.push(String(date.getHours()).padStart(2, '0'));
    if (minute) timeParts.push(String(date.getMinutes()).padStart(2, '0'));
    return `${result} ${timeParts.join(':')}`;
  }
  return result;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}天前`;
  if (diffHours > 0) return `${diffHours}小时前`;
  if (diffMins > 0) return `${diffMins}分钟前`;
  return '刚刚';
}
