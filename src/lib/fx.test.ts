import { describe, it, expect } from 'vitest';
import {
  needsConversion,
  isHkexScenario,
  getEffectiveCurrency,
  inferCurrencyFromSymbol,
  convertToAccountCNY,
} from '@/lib/fx';
import type { FxRates } from '@/lib/fx';

const HKEX_2026_07_13 = { date: '2026-07-13', bid: 0.86488, ask: 0.86492 };

function makeRates(overrides: Partial<FxRates> = {}): FxRates {
  return {
    HKD: 0.8652,
    USD: 7.24,
    EUR: 7.85,
    JPY: 0.048,
    GBP: 9.15,
    ...overrides,
  };
}

describe('needsConversion', () => {
  it('same currency → false', () => {
    expect(needsConversion('CNY', 'CNY')).toBe(false);
    expect(needsConversion('HKD', 'HKD')).toBe(false);
    expect(needsConversion('USD', 'USD')).toBe(false);
  });

  it('different currencies → true', () => {
    expect(needsConversion('HKD', 'CNY')).toBe(true);
    expect(needsConversion('USD', 'CNY')).toBe(true);
    expect(needsConversion('USD', 'HKD')).toBe(true);
  });
});

describe('isHkexScenario', () => {
  it('CNY account + HKD position → true', () => {
    expect(isHkexScenario('HKD', 'CNY')).toBe(true);
  });

  it('HKD account + HKD position → false (same currency)', () => {
    expect(isHkexScenario('HKD', 'HKD')).toBe(false);
  });

  it('CNY account + CNY position → false (same currency)', () => {
    expect(isHkexScenario('CNY', 'CNY')).toBe(false);
  });

  it('USD account + USD position → false', () => {
    expect(isHkexScenario('USD', 'USD')).toBe(false);
  });

  it('CNY account + USD position → false (not HKD)', () => {
    expect(isHkexScenario('USD', 'CNY')).toBe(false);
  });
});

describe('getEffectiveCurrency', () => {
  it('uses position currency when set', () => {
    expect(getEffectiveCurrency('USD', 'CNY')).toBe('USD');
    expect(getEffectiveCurrency('HKD', 'CNY')).toBe('HKD');
  });

  it('falls back to account currency when position currency is empty/undefined', () => {
    expect(getEffectiveCurrency('', 'CNY')).toBe('CNY');
    expect(getEffectiveCurrency(undefined as unknown as string, 'HKD')).toBe('HKD');
  });
});

describe('inferCurrencyFromSymbol', () => {
  it('5-digit → HKD (港股)', () => {
    expect(inferCurrencyFromSymbol('00700')).toBe('HKD');
    expect(inferCurrencyFromSymbol('03690')).toBe('HKD');
  });

  it('6-digit A-share → CNY', () => {
    expect(inferCurrencyFromSymbol('000001')).toBe('CNY');
    expect(inferCurrencyFromSymbol('600519')).toBe('CNY');
    expect(inferCurrencyFromSymbol('300750')).toBe('CNY');
  });

  it('letter codes → USD (美股)', () => {
    expect(inferCurrencyFromSymbol('AAPL')).toBe('USD');
    expect(inferCurrencyFromSymbol('TSLA')).toBe('USD');
  });

  it('defaults to CNY', () => {
    expect(inferCurrencyFromSymbol('')).toBe('CNY');
    expect(inferCurrencyFromSymbol('UNKNOWN')).toBe('CNY');
  });
});

describe('convertToAccountCNY', () => {
  describe('same currency (no conversion needed)', () => {
    it('CNY position in CNY account → returns original value', () => {
      const rates = makeRates();
      expect(convertToAccountCNY(10000, 'CNY', 'CNY', rates)).toBe(10000);
    });

    it('HKD position in HKD account → returns original value', () => {
      const rates = makeRates();
      expect(convertToAccountCNY(10000, 'HKD', 'HKD', rates)).toBe(10000);
    });

    it('USD position in USD account → returns original value', () => {
      const rates = makeRates();
      expect(convertToAccountCNY(1000, 'USD', 'USD', rates)).toBe(1000);
    });
  });

  describe('HKD CNY account (港股通)', () => {
    it('with HKEX rate → uses ask (卖出结算汇率)', () => {
      const rates = makeRates({ hkex: HKEX_2026_07_13 });
      const result = convertToAccountCNY(100000, 'HKD', 'CNY', rates);
      // 100000 × 0.86492 = 86492
      expect(result).toBeCloseTo(86492, 2);
    });

    it('without HKEX rate → falls back to HKD sell rate', () => {
      const rates = makeRates();
      const result = convertToAccountCNY(100000, 'HKD', 'CNY', rates);
      // 100000 × 0.8652 = 86520
      expect(result).toBeCloseTo(86520, 2);
    });

    it('HKEX ask rate differs from bank sell rate', () => {
      // 港股通结算汇率（0.86492）≠ 中行 HKD 卖出价（0.8652）
      const rates = makeRates({ HKD: 0.8652, hkex: HKEX_2026_07_13 });
      const withHkex = convertToAccountCNY(100000, 'HKD', 'CNY', rates);
      const withoutHkex = convertToAccountCNY(100000, 'HKD', 'CNY', { ...rates, hkex: undefined });
      expect(withHkex).not.toBeCloseTo(withoutHkex, 1);
    });
  });

  describe('other cross-currency conversions', () => {
    it('USD position in CNY account → uses USD sell rate', () => {
      const rates = makeRates({ USD: 7.24 });
      const result = convertToAccountCNY(100, 'USD', 'CNY', rates);
      expect(result).toBeCloseTo(724, 2);
    });

    it('EUR position in CNY account → uses EUR sell rate', () => {
      const rates = makeRates({ EUR: 7.85 });
      const result = convertToAccountCNY(50, 'EUR', 'CNY', rates);
      expect(result).toBeCloseTo(392.5, 1);
    });

    it('HKD position in USD account → uses HKD sell rate', () => {
      const rates = makeRates({ HKD: 0.8652 });
      const result = convertToAccountCNY(5000, 'HKD', 'USD', rates);
      expect(result).toBeCloseTo(4326, 0);
    });

    it('GBP position in CNY account → uses GBP sell rate', () => {
      const rates = makeRates({ GBP: 9.15 });
      const result = convertToAccountCNY(10, 'GBP', 'CNY', rates);
      expect(result).toBeCloseTo(91.5, 1);
    });

    it('JPY position in CNY account → uses JPY sell rate', () => {
      const rates = makeRates({ JPY: 0.048 });
      const result = convertToAccountCNY(10000, 'JPY', 'CNY', rates);
      expect(result).toBeCloseTo(480, 1);
    });
  });

  describe('edge cases', () => {
    it('unknown currency → returns original value (no crash)', () => {
      const rates = makeRates();
      const result = convertToAccountCNY(100, 'UNKNOWN' as 'CNY', 'CNY', rates);
      expect(result).toBe(100);
    });

    it('zero amount → returns 0', () => {
      const rates = makeRates();
      expect(convertToAccountCNY(0, 'HKD', 'CNY', rates)).toBe(0);
      expect(convertToAccountCNY(0, 'USD', 'CNY', rates)).toBe(0);
    });

    it('fractional amounts → correct precision', () => {
      const rates = makeRates({ HKD: 0.8652 });
      const result = convertToAccountCNY(1.5, 'HKD', 'CNY', rates);
      expect(result).toBeCloseTo(1.2978, 4);
    });
  });
});
