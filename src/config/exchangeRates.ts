/**
 * 统一配置 - 汇率默认值
 * 所有模块应从此文件导入汇率默认值，确保一致性
 */

export interface ExchangeRates {
  CNY: number;
  HKD: number;
  USD: number;
  EUR: number;
  JPY: number;
  GBP: number;
  [key: string]: number;
}

// 汇率默认值：1 单位外币 = X 人民币
export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  CNY: 1,
  HKD: 0.8637,  // 用户确认值
  USD: 7.24,
  EUR: 7.85,
  JPY: 0.048,
  GBP: 9.15,
};

// 支持的货币列表
export const SUPPORTED_CURRENCIES = ['CNY', 'HKD', 'USD', 'EUR', 'JPY', 'GBP'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

// 货币名称映射
export const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  CNY: '人民币',
  HKD: '港币',
  USD: '美元',
  EUR: '欧元',
  JPY: '日元',
  GBP: '英镑',
};
