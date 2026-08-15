export { getBusinessDateParts, getBusinessDate, getBusinessMonth, getBusinessYear, isSameBusinessDay } from '@/lib/domain/businessDate';

export function formatBusinessDateTime(date: Date | string, locale = 'zh-CN'): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
