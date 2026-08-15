import type { CurrencyCode } from './money';

export function normalizeCurrency(currency: string | undefined | null): CurrencyCode {
  const value = (currency || 'CNY').trim().toUpperCase();
  return value as CurrencyCode;
}

export function canAddCurrency(left: CurrencyCode, right: CurrencyCode): boolean {
  return left === right;
}

export function assertSameCurrency(left: CurrencyCode, right: CurrencyCode): void {
  if (left !== right) {
    throw new Error(`Currency mismatch: ${left} vs ${right}`);
  }
}

export function formatCurrencyCode(currency: CurrencyCode): string {
  return currency.toUpperCase();
}
