/**
 * 共享格式化工具函数
 */

import { SUPPORTED_CURRENCIES } from '@/config/exchangeRates';

/**
 * 格式化货币显示
 * @param value 数值（会自动取绝对值）
 * @param currency 货币代码，默认 CNY
 * @param options 额外选项
 */
export function formatCurrency(
  value: number,
  currency = 'CNY',
  options: { showSign?: boolean; sign?: '+' | '-' } = {}
): string {
  const { showSign = false, sign = value >= 0 ? '+' : '-' } = options;
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

/**
 * 格式化百分比显示
 * @param value 百分比值（如 5.23 表示 5.23%）
 * @param showSign 是否显示正负号，默认 true
 */
export function formatPercent(value: number, showSign = true): string {
  const sign = value >= 0 ? '+' : '';
  return showSign ? `${sign}${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
}

/**
 * 格式化数字显示（不带货币符号）
 * @param value 数值
 * @param decimals 小数位数，默认 2
 */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 格式化价格（带货币单位）
 * @param value 数值
 * @param currency 货币代码
 */
export function formatPrice(value: number, currency = 'CNY'): string {
  return formatCurrency(value, currency);
}

/**
 * 根据货币代码获取格式化后的货币符号
 */
export function getCurrencySymbol(currency: string): string {
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

/**
 * 验证货币代码是否有效
 */
export function isValidCurrency(
  currency: string
): currency is typeof SUPPORTED_CURRENCIES[number] {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}

/**
 * 格式化日期时间
 * @param dateStr ISO 日期字符串
 * @param options 格式化选项
 */
export function formatDateTime(
  dateStr: string,
  options: {
    year?: boolean;
    month?: boolean;
    day?: boolean;
    hour?: boolean;
    minute?: boolean;
  } = {}
): string {
  const {
    year = true,
    month = true,
    day = true,
    hour = false,
    minute = false,
  } = options;

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

/**
 * 格式化相对时间（如"3天前"）
 */
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
