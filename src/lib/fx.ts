/**
 * 统一汇率换算模块
 *
 * 规则：
 * 1. 持仓币种 = 账户币种 → 无需换算
 * 2. CNY 账户持港股（港股通）→ 使用 SZSE 港股通结算汇率
 *    - 持仓值换算：HKD × 结算卖出比率 → CNY（买港股时你付人民币，用卖出比率）
 * 3. 其他所有跨币种情况 → 使用银行现汇卖出价（1 外币 = X CNY）
 *
 * 数据来源：
 * - 现汇卖出价：Sina 外汇 API（field 2）
 * - 港股通结算汇率：深交所（browser fetch）→ Supabase 存储
 */

import { DEFAULT_EXCHANGE_RATES, type ExchangeRates } from '@/config/exchangeRates';
import { fetchSinaForexRates } from '@/lib/forexApi';
import { getHkexSettlementRate } from '@/lib/hkexRateClient';

// 港股通结算汇率结构
export interface HkexSettlementRates {
  date: string; // 交易日 YYYY-MM-DD
  bid: number;  // 买入结算汇兑比率（HKD → CNY）
  ask: number;  // 卖出结算汇兑比率（HKD → CNY）
}

/**
 * 汇率数据结构（支持买卖双价）
 */
export interface FxRates {
  // 基础汇率：1 外币 = X CNY（现汇卖出价 / 银行卖给你外汇时的汇率）
  HKD: number;
  USD: number;
  EUR: number;
  JPY: number;
  GBP: number;

  // 港股通结算汇率（CNY 账户持港股时使用）
  hkex?: HkexSettlementRates;
}

// 缓存
let cachedRates: FxRates | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 min

// 昨日交易日（跳过周末）
export function getPreviousTradingDay(): string {
  const today = new Date();
  const day = today.getDay();
  let offset = day === 1 ? 3 : day === 0 ? 2 : 1;
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
}

/**
 * 获取完整汇率数据（含港股通）
 */
export async function getFxRates(): Promise<FxRates> {
  const now = Date.now();
  if (cachedRates && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    const [forexResults, hkexRate] = await Promise.allSettled([
      fetchSinaForexRates(),
      getHkexSettlementRate(),
    ]);

    const result: FxRates = {
      HKD: DEFAULT_EXCHANGE_RATES.HKD,
      USD: DEFAULT_EXCHANGE_RATES.USD,
      EUR: DEFAULT_EXCHANGE_RATES.EUR,
      JPY: DEFAULT_EXCHANGE_RATES.JPY,
      GBP: DEFAULT_EXCHANGE_RATES.GBP,
    };

    if (forexResults.status === 'fulfilled' && forexResults.value.length > 0) {
      for (const r of forexResults.value) {
        if (r.code !== 'CNY' && r.rate > 0) {
          (result as unknown as Record<string, number>)[r.code] = r.rate;
        }
      }
    }

    if (hkexRate.status === 'fulfilled' && hkexRate.value) {
      result.hkex = hkexRate.value.rate;
    }

    cachedRates = result;
    cacheTimestamp = now;
    return result;
  } catch (error) {
    console.error('[fx] getFxRates failed:', error);
    return {
      HKD: DEFAULT_EXCHANGE_RATES.HKD,
      USD: DEFAULT_EXCHANGE_RATES.USD,
      EUR: DEFAULT_EXCHANGE_RATES.EUR,
      JPY: DEFAULT_EXCHANGE_RATES.JPY,
      GBP: DEFAULT_EXCHANGE_RATES.GBP,
    };
  }
}

/**
 * 同步获取汇率（客户端用，直接取缓存或默认值）
 * 在组件内使用请优先用 useFxRates hook
 */
export function getFxRatesSync(): FxRates {
  if (cachedRates) return cachedRates;
  return {
    HKD: DEFAULT_EXCHANGE_RATES.HKD,
    USD: DEFAULT_EXCHANGE_RATES.USD,
    EUR: DEFAULT_EXCHANGE_RATES.EUR,
    JPY: DEFAULT_EXCHANGE_RATES.JPY,
    GBP: DEFAULT_EXCHANGE_RATES.GBP,
  };
}

/**
 * 判断是否需要换算
 * posCurrency = 持仓币种，acctCurrency = 账户币种
 */
export function needsConversion(posCurrency: string, acctCurrency: string): boolean {
  return posCurrency !== acctCurrency;
}

/**
 * 判断是否港股通场景（CNY 账户 + HKD 持仓）
 */
export function isHkexScenario(posCurrency: string, acctCurrency: string): boolean {
  return posCurrency === 'HKD' && acctCurrency === 'CNY';
}

/**
 * 将持仓价值换算成账户本币（CNY）
 *
 * @param positionValueHkd  持仓名义值（按持仓币种计，如 1000 股 × 50 HKD）
 * @param posCurrency        持仓币种
 * @param acctCurrency      账户本币
 * @param rates             汇率数据
 * @returns 换算后的 CNY 价值
 */
export function convertToAccountCNY(
  positionValue: number, // 持仓名义值（数量 × 单价，不带币种）
  posCurrency: string,
  acctCurrency: string,
  rates: FxRates
): number {
  // 1. 同币种，无需换算
  if (posCurrency === acctCurrency) {
    return positionValue;
  }

  // 2. 港股通场景（CNY 账户 + HKD 持仓）→ 港股通结算汇率
  if (isHkexScenario(posCurrency, acctCurrency)) {
    if (rates.hkex && rates.hkex.ask > 0) {
      return positionValue * rates.hkex.ask;
    }
    // 无港股通汇率时，用 HKD 现汇卖出价作为 fallback
    return positionValue * rates.HKD;
  }

  // 3. 其他跨币种 → 现汇卖出价（1 外币 = X CNY）
  const fxRate = (rates as unknown as Record<string, number | HkexSettlementRates>)[posCurrency];
  if (typeof fxRate === 'number' && fxRate > 0) {
    return positionValue * fxRate;
  }

  // 兜底：无法识别，返回原值（不应该发生）
  console.warn(`[fx] Unknown currency pair: ${posCurrency} → ${acctCurrency}, returning original value`);
  return positionValue;
}

/**
 * 将持仓价值换算成账户本币（异步版，自动获取最新汇率）
 */
export async function convertToAccountCNYAsync(
  positionValue: number,
  posCurrency: string,
  acctCurrency: string
): Promise<number> {
  const rates = await getFxRates();
  return convertToAccountCNY(positionValue, posCurrency, acctCurrency, rates);
}

/**
 * 获取某个持仓的币种（优先持仓自己的币种，其次账户币种）
 */
export function getEffectiveCurrency(
  posCurrency: string | undefined,
  acctCurrency: string
): string {
  return posCurrency || acctCurrency;
}

/**
 * 根据股票代码推断币种（辅助函数）
 */
export function inferCurrencyFromSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  // 5 位数字 → 港股（HKD），但港股通也是 HKD，适用同样规则
  if (/^\d{5}$/.test(upper)) return 'HKD';
  // A 股（沪深）
  if (/^[0236]\d{5}$/.test(upper)) return 'CNY';
  // 基金 5 位
  if (/^5\d{5}$/.test(upper)) return 'CNY';
  // 美股字母股
  if (/^[A-Z]{1,5}$/.test(upper)) return 'USD';
  return 'CNY';
}

/**
 * 清除汇率缓存（强制刷新时调用）
 */
export function clearFxCache(): void {
  cachedRates = null;
  cacheTimestamp = 0;
}
