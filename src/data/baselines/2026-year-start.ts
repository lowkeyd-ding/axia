import type { LocalPriceBaseline } from '@/lib/returnEngine';

/**
 * 本地维护的 2026 年年初/2025 年最后交易日基准。
 * 说明：
 * - 这里先补充常见标的的年度基准，便于本地调试收益口径。
 * - 后续如有更多持仓，可继续在这里补充。
 */
export const YEAR_START_2026: Record<string, LocalPriceBaseline> = {
  // 港股 / 港股通常见标的
  '03690': { date: '2025-12-31', price: 103.3, currency: 'HKD' }, // 美团-W
  '00700': { date: '2025-12-31', price: 412.0, currency: 'HKD' }, // 腾讯控股
  '09988': { date: '2025-12-31', price: 204.0, currency: 'HKD' }, // 阿里巴巴
  '01810': { date: '2025-12-31', price: 57.5, currency: 'HKD' }, // 小米集团
  '00941': { date: '2025-12-31', price: 81.0, currency: 'HKD' }, // 中国移动
  '01299': { date: '2025-12-31', price: 68.0, currency: 'HKD' }, // 友邦保险

  // 美股常见标的
  AAPL: { date: '2025-12-31', price: 192.53, currency: 'USD' },
  MSFT: { date: '2025-12-31', price: 421.88, currency: 'USD' },
  TSLA: { date: '2025-12-31', price: 403.34, currency: 'USD' },
  NVDA: { date: '2025-12-31', price: 135.12, currency: 'USD' },
  AMZN: { date: '2025-12-31', price: 227.0, currency: 'USD' },
  META: { date: '2025-12-31', price: 630.0, currency: 'USD' },

  // A 股常见标的
  '600519': { date: '2025-12-31', price: 1620.0, currency: 'CNY' }, // 贵州茅台
  '000002': { date: '2025-12-31', price: 7.4, currency: 'CNY' }, // 万科A
  '000001': { date: '2025-12-31', price: 11.6, currency: 'CNY' }, // 平安银行
  '600036': { date: '2025-12-31', price: 39.8, currency: 'CNY' }, // 招商银行
  '601318': { date: '2025-12-31', price: 49.2, currency: 'CNY' }, // 中国平安
  '300750': { date: '2025-12-31', price: 210.5, currency: 'CNY' }, // 宁德时代
};
