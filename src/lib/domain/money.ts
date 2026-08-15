export type CurrencyCode = 'CNY' | 'USD' | 'HKD' | 'EUR' | 'JPY' | 'GBP' | (string & {});

export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly scale: number;
}

export type MoneyRoundingMode = 'half-up' | 'trunc';

export interface MoneyOptions {
  currency: CurrencyCode;
  scale?: number;
  roundingMode?: MoneyRoundingMode;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

export function roundDecimal(value: number, scale: number, mode: MoneyRoundingMode = 'half-up'): number {
  assertFinite(value, 'value');
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error('scale must be a non-negative integer');
  }
  const factor = 10 ** scale;
  if (mode === 'trunc') {
    return Math.trunc(value * factor) / factor;
  }
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function createMoney(amount: number, options: MoneyOptions): Money {
  assertFinite(amount, 'amount');
  const scale = options.scale ?? 2;
  return {
    amount: roundDecimal(amount, scale, options.roundingMode),
    currency: options.currency,
    scale,
  };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error(`Cannot add ${left.currency} to ${right.currency} without conversion`);
  }
  const scale = Math.max(left.scale, right.scale);
  return createMoney(roundDecimal(left.amount + right.amount, scale), {
    currency: left.currency,
    scale,
  });
}

export function subtractMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error(`Cannot subtract ${right.currency} from ${left.currency} without conversion`);
  }
  const scale = Math.max(left.scale, right.scale);
  return createMoney(roundDecimal(left.amount - right.amount, scale), {
    currency: left.currency,
    scale,
  });
}

export function multiplyMoney(money: Money, factor: number, scale = money.scale): Money {
  assertFinite(factor, 'factor');
  return createMoney(roundDecimal(money.amount * factor, scale), {
    currency: money.currency,
    scale,
  });
}

export function negateMoney(money: Money): Money {
  return createMoney(-money.amount, { currency: money.currency, scale: money.scale });
}

export function isZeroMoney(money: Money): boolean {
  return money.amount === 0;
}

export function sameCurrency(left: Money, right: Money): boolean {
  return left.currency === right.currency;
}

export function moneyFromNumber(amount: number, currency: CurrencyCode, scale = 2): Money {
  return createMoney(amount, { currency, scale });
}
