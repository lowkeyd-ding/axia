import { describe, it, expect } from 'vitest';
import { addMoney, createMoney, moneyFromNumber, roundDecimal } from '@/lib/domain/money';
import { addQuantity, createQuantity, roundQuantity } from '@/lib/domain/quantity';
import { getBusinessDate, getBusinessMonth, getBusinessYear, isSameBusinessDay } from '@/lib/domain/businessDate';
import { assertSameCurrency, normalizeCurrency } from '@/lib/domain/currency';

describe('domain money', () => {
  it('rounds decimals deterministically', () => {
    expect(roundDecimal(1.005, 2)).toBe(1.01);
    expect(roundDecimal(-1.005, 2)).toBe(-1);
  });

  it('rejects adding different currencies', () => {
    expect(() => addMoney(createMoney(10, { currency: 'CNY' }), createMoney(2, { currency: 'USD' }))).toThrow();
  });

  it('keeps currency with explicit creation', () => {
    expect(moneyFromNumber(12.345, 'USD', 2)).toEqual({ amount: 12.35, currency: 'USD', scale: 2 });
  });
});

describe('domain quantity', () => {
  it('rounds quantity to 4 decimals', () => {
    expect(roundQuantity(1.23456)).toBe(1.2346);
    expect(addQuantity(createQuantity(1.2), createQuantity(2.3)).value).toBe(3.5);
  });
});

describe('domain business date', () => {
  it('uses Shanghai business date rules', () => {
    const date = new Date('2026-07-19T16:30:00.000Z');
    expect(getBusinessDate(date)).toBe('2026-07-20');
    expect(getBusinessMonth(date)).toBe('2026-07');
    expect(getBusinessYear(date)).toBe('2026');
  });

  it('compares business day correctly', () => {
    expect(isSameBusinessDay('2026-07-19T16:30:00.000Z', '2026-07-19T17:30:00.000Z')).toBe(true);
  });
});

describe('domain currency', () => {
  it('normalizes currency codes', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
  });

  it('rejects mismatched currency assertion', () => {
    expect(() => assertSameCurrency('CNY', 'USD')).toThrow();
  });
});
