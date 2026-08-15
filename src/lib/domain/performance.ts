import type { EconomicEvent } from './events';
import { historicalValuationAt, type PriceObservation } from './priceObservation';
import type { Money } from './money';
import { createMoney } from './money';

export interface DataQualityIssue {
  code: 'missing_price' | 'missing_cashflow' | 'ambiguous_snapshot' | 'insufficient_history';
  message: string;
}

export interface DataQuality {
  complete: boolean;
  issues: DataQualityIssue[];
}

export interface PerformanceResult {
  netAssetChange: Money;
  unrealizedPnL: Money;
  realizedPnL: Money;
  cashFlowAdjustedReturn: number | null;
  dataQuality: DataQuality;
}

function sumExternalCashFlow(events: EconomicEvent[]): number {
  return events.reduce((sum, event) => {
    if (event.type === 'external_cash_in') return sum + (event as EconomicEvent & { amount: Money }).amount.amount;
    if (event.type === 'external_cash_out') return sum - (event as EconomicEvent & { amount: Money }).amount.amount;
    return sum;
  }, 0);
}

export function computeStrictPerformance(input: {
  openingValue: Money;
  closingValue: Money;
  events: EconomicEvent[];
  observations: PriceObservation[];
  asOfDate: string;
  currency?: Money['currency'];
}): PerformanceResult {
  const currency = input.currency || input.closingValue.currency || input.openingValue.currency;
  const externalCashFlow = sumExternalCashFlow(input.events);
  const netAssetChange = createMoney(input.closingValue.amount - input.openingValue.amount, { currency });

  const realizedPnL = input.events.reduce((sum, event) => {
    if (event.type !== 'sell') return sum;
    const sellEvent = event as EconomicEvent & { price: Money; quantity: { value: number }; fees: Money };
    const sellProceeds = sellEvent.price.amount * sellEvent.quantity.value - sellEvent.fees.amount;
    const cost = sellEvent.price.amount * sellEvent.quantity.value;
    return sum + (sellProceeds - cost);
  }, 0);

  const unrealizedPnL = createMoney(input.closingValue.amount - input.openingValue.amount - realizedPnL, { currency });

  const valuation = historicalValuationAt('PORTFOLIO', input.asOfDate, input.observations);
  const issues: DataQualityIssue[] = [];

  if (!valuation.complete) {
    issues.push({ code: 'missing_price', message: valuation.missingReason || '缺少价格观测' });
  }
  if (input.events.length === 0) {
    issues.push({ code: 'insufficient_history', message: '缺少事件历史' });
  }

  const hasEnoughBase = input.openingValue.amount > 0 || externalCashFlow !== 0 || input.events.length > 1;
  if (!hasEnoughBase) {
    issues.push({ code: 'missing_cashflow', message: '缺少足够现金流信息，无法严格计算回报' });
  }

  const denom = input.openingValue.amount + Math.max(externalCashFlow, 0);
  const cashFlowAdjustedReturn = denom > 0 ? ((input.closingValue.amount - input.openingValue.amount - externalCashFlow) / denom) * 100 : null;

  return {
    netAssetChange,
    unrealizedPnL,
    realizedPnL: createMoney(realizedPnL, { currency }),
    cashFlowAdjustedReturn,
    dataQuality: {
      complete: issues.length === 0,
      issues,
    },
  };
}
