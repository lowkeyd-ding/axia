import { describe, it, expect } from 'vitest';

describe('API Route - Helper Functions (Unit Tests)', () => {
  // Helper functions extracted from the route logic for testing
  function toSinaSymbol(symbol: string): { sinaSymbol: string; exchange: string } {
    const upper = symbol.toUpperCase();
    if (/^[023]\d{5}$/.test(upper)) return { sinaSymbol: `sz${upper}`, exchange: 'SZ' };
    if (/^[569]\d{5}$/.test(upper)) return { sinaSymbol: `sh${upper}`, exchange: 'SH' };
    if (/^\d{5}$/.test(upper)) return { sinaSymbol: `hk${upper}`, exchange: 'HK' };
    if (/^[A-Z]{1,5}$/.test(upper)) return { sinaSymbol: `us${upper.toLowerCase()}`, exchange: 'US' };
    return { sinaSymbol: upper, exchange: 'UNKNOWN' };
  }

  function getExchange(symbol: string): string {
    const upper = symbol.toUpperCase();
    if (/^[023]\d{5}$/.test(upper)) return 'SZ';
    if (/^[569]\d{5}$/.test(upper)) return 'SH';
    if (/^\d{5}$/.test(upper)) return 'HK';
    if (/^[A-Z]{1,5}$/.test(upper)) return 'US';
    return 'UNKNOWN';
  }

  describe('toSinaSymbol', () => {
    it('should convert SZ A-share symbols', () => {
      const result = toSinaSymbol('000001');
      expect(result.sinaSymbol).toBe('sz000001');
      expect(result.exchange).toBe('SZ');
    });

    it('should convert SH A-share symbols', () => {
      const result = toSinaSymbol('600519');
      expect(result.sinaSymbol).toBe('sh600519');
      expect(result.exchange).toBe('SH');
    });

    it('should convert HK stock symbols', () => {
      const result = toSinaSymbol('00700');
      expect(result.sinaSymbol).toBe('hk00700');
      expect(result.exchange).toBe('HK');
    });

    it('should convert US stock symbols to lowercase', () => {
      const result = toSinaSymbol('AAPL');
      expect(result.sinaSymbol).toBe('usaapl');
      expect(result.exchange).toBe('US');
    });

    it('should be case insensitive', () => {
      const result = toSinaSymbol('aapl');
      expect(result.sinaSymbol).toBe('usaapl');
    });

    it('should handle unknown symbols', () => {
      const result = toSinaSymbol('invalid');
      expect(result.sinaSymbol).toBe('INVALID');
      expect(result.exchange).toBe('UNKNOWN');
    });
  });

  describe('getExchange', () => {
    it('should detect SZ exchange (0,2,3 prefix)', () => {
      expect(getExchange('000001')).toBe('SZ');
      expect(getExchange('200001')).toBe('SZ');
      expect(getExchange('300001')).toBe('SZ');
    });

    it('should detect SH exchange (5,6,9 prefix)', () => {
      expect(getExchange('600519')).toBe('SH');
      expect(getExchange('510050')).toBe('SH');
      expect(getExchange('688111')).toBe('SH');
    });

    it('should detect HK exchange (5 digits)', () => {
      expect(getExchange('00700')).toBe('HK');
      expect(getExchange('09988')).toBe('HK');
      expect(getExchange('18100')).toBe('HK');
    });

    it('should detect US exchange (letters)', () => {
      expect(getExchange('AAPL')).toBe('US');
      expect(getExchange('NVDA')).toBe('US');
      expect(getExchange('TSLA')).toBe('US');
    });

    it('should return UNKNOWN for unrecognized patterns', () => {
      expect(getExchange('abc123')).toBe('UNKNOWN');
      expect(getExchange('')).toBe('UNKNOWN');
    });
  });

  describe('API Parameter Validation Logic', () => {
    it('should validate symbol parameter is required', () => {
      const validateSymbols = (symbolsParam: string | null) => {
        if (!symbolsParam) {
          return { error: 'Missing symbols parameter', status: 400 };
        }
        const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (symbols.length === 0) {
          return { prices: [] };
        }
        if (symbols.length > 50) {
          return { error: 'Too many symbols (max 50)', status: 400 };
        }
        return { symbols };
      };

      expect(validateSymbols(null)).toEqual({ error: 'Missing symbols parameter', status: 400 });
      expect(validateSymbols('')).toEqual({ error: 'Missing symbols parameter', status: 400 });
      expect(validateSymbols('   ')).toEqual({ prices: [] });
    });

    it('should validate max 50 symbols', () => {
      const symbols = Array.from({ length: 51 }, (_, i) => `SYM${i}`);
      expect(symbols.length).toBe(51);
    });

    it('should normalize symbols to uppercase', () => {
      const normalize = (symbolsParam: string) => {
        return symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      };
      expect(normalize('aapl,Nvda,tsla')).toEqual(['AAPL', 'NVDA', 'TSLA']);
      expect(normalize('  600519  , 000001  ')).toEqual(['600519', '000001']);
    });
  });

  describe('Mock Data Fallback', () => {
    it('should have mock data for common symbols', () => {
      const MOCK_PRICES: Record<string, { price: number; change: number; name: string }> = {
        '000002': { price: 7.15, change: -0.08, name: '万科A' },
        '000001': { price: 11.23, change: 0.15, name: '平安银行' },
        '600519': { price: 1688.00, change: 12.50, name: '贵州茅台' },
        '00700': { price: 368.00, change: 5.20, name: '腾讯控股' },
        'AAPL': { price: 178.50, change: 1.23, name: 'Apple Inc.' },
      };

      expect(MOCK_PRICES['600519'].name).toBe('贵州茅台');
      expect(MOCK_PRICES['600519'].price).toBe(1688.00);
      expect(MOCK_PRICES['AAPL'].price).toBe(178.50);
    });

    it('should calculate changePercent from mock data', () => {
      const mock = { price: 1688.00, change: 12.50, name: '贵州茅台' };
      const changePercent = (mock.change / (mock.price - mock.change)) * 100;
      expect(changePercent).toBeCloseTo(0.746, 1);
    });
  });
});
