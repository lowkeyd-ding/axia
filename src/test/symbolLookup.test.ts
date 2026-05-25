import { describe, it, expect } from 'vitest';
import {
  searchSymbols,
  getSymbolInfo,
  detectAssetType,
  type SymbolInfo,
} from '@/lib/symbolLookup';

describe('symbolLookup - searchSymbols', () => {
  it('should return empty array for empty query', () => {
    expect(searchSymbols('')).toEqual([]);
    expect(searchSymbols('  ')).toEqual([]);
  });

  it('should find stocks by partial code match', () => {
    const results = searchSymbols('6005');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.symbol === '600519')).toBe(true);
  });

  it('should find stocks by partial name match', () => {
    const results = searchSymbols('茅台');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.symbol === '600519')).toBe(true);
  });

  it('should find stocks by full code', () => {
    const results = searchSymbols('000001');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.symbol === '000001')).toBe(true);
  });

  it('should be case insensitive for US stock symbols', () => {
    const results1 = searchSymbols('aapl');
    const results2 = searchSymbols('AAPL');
    expect(results1.length).toBe(results2.length);
    expect(results1.length).toBeGreaterThan(0);
  });

  it('should find funds when assetType is fund', () => {
    const results = searchSymbols('50', 'fund');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.assetType === 'fund')).toBe(true);
  });

  it('should find stocks when assetType is stock', () => {
    const results = searchSymbols('茅台', 'stock');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.assetType === 'stock')).toBe(true);
  });

  it('should return limited results', () => {
    const results = searchSymbols('00');
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('should find HK stocks', () => {
    const results = searchSymbols('腾讯');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.symbol === '00700')).toBe(true);
  });

  it('should find US stocks by full symbol', () => {
    const results = searchSymbols('NVDA');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.symbol === 'NVDA')).toBe(true);
  });
});

describe('symbolLookup - getSymbolInfo', () => {
  it('should find A-share stock by exact symbol', () => {
    const result = getSymbolInfo('600519');
    expect(result).toBeDefined();
    expect(result!.symbol).toBe('600519');
    expect(result!.name).toBe('贵州茅台');
    expect(result!.assetType).toBe('stock');
  });

  it('should find SZ stock by exact symbol', () => {
    const result = getSymbolInfo('000001');
    expect(result).toBeDefined();
    expect(result!.name).toBe('平安银行');
  });

  it('should find fund by exact symbol', () => {
    const result = getSymbolInfo('510050');
    expect(result).toBeDefined();
    expect(result!.assetType).toBe('fund');
  });

  it('should find HK stock by exact symbol', () => {
    const result = getSymbolInfo('00700');
    expect(result).toBeDefined();
    expect(result!.name).toBe('腾讯控股');
    expect(result!.exchange).toBe('HK');
  });

  it('should find US stock by exact symbol (case insensitive)', () => {
    const result1 = getSymbolInfo('AAPL');
    const result2 = getSymbolInfo('aapl');
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(result1!.name).toBe(result2!.name);
  });

  it('should return undefined for non-existent symbol', () => {
    const result = getSymbolInfo('999999');
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty symbol', () => {
    const result = getSymbolInfo('');
    expect(result).toBeUndefined();
  });
});

describe('symbolLookup - detectAssetType', () => {
  it('should detect A-share stocks (6-digit, 000xxx-009xxx)', () => {
    expect(detectAssetType('600519')).toBe('stock');
    expect(detectAssetType('000001')).toBe('stock');
    expect(detectAssetType('688111')).toBe('stock');
  });

  it('should detect A-share funds (6-digit, 51xxxx, 15xxxx etc)', () => {
    expect(detectAssetType('510050')).toBe('fund');
    expect(detectAssetType('159919')).toBe('fund');
    expect(detectAssetType('161725')).toBe('fund');
    expect(detectAssetType('470058')).toBe('fund');
    expect(detectAssetType('485105')).toBe('fund');
  });

  it('should detect HK stocks (5 digits)', () => {
    expect(detectAssetType('00700')).toBe('stock');
    expect(detectAssetType('09988')).toBe('stock');
  });

  it('should detect US stocks (letters)', () => {
    expect(detectAssetType('AAPL')).toBe('stock');
    expect(detectAssetType('nvda')).toBe('stock');
    expect(detectAssetType('TSLA')).toBe('stock');
  });

  it('should default to stock for unknown patterns', () => {
    expect(detectAssetType('abc123')).toBe('stock');
    expect(detectAssetType('X')).toBe('stock');
  });
});

describe('symbolLookup - Comprehensive Coverage', () => {
  it('should have data for major Chinese stocks', () => {
    const majorStocks = ['600519', '600036', '601318', '000001', '000002'];
    majorStocks.forEach((symbol) => {
      const info = getSymbolInfo(symbol);
      expect(info).toBeDefined();
      expect(info!.assetType).toBe('stock');
    });
  });

  it('should have data for major US stocks', () => {
    const usStocks = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'TSLA', 'META'];
    usStocks.forEach((symbol) => {
      const info = getSymbolInfo(symbol);
      expect(info).toBeDefined();
      expect(info!.assetType).toBe('stock');
      expect(info!.exchange).toBe('US');
    });
  });

  it('should have data for major HK stocks', () => {
    const hkStocks = ['00700', '09988', '01810', '03690'];
    hkStocks.forEach((symbol) => {
      const info = getSymbolInfo(symbol);
      expect(info).toBeDefined();
      expect(info!.assetType).toBe('stock');
      expect(info!.exchange).toBe('HK');
    });
  });

  it('should have data for major ETF funds', () => {
    const etfs = ['510050', '510300', '510500', '159919', '159915'];
    etfs.forEach((symbol) => {
      const info = getSymbolInfo(symbol);
      expect(info).toBeDefined();
      expect(info!.assetType).toBe('fund');
    });
  });

  it('should correctly filter by asset type in search', () => {
    const stockResults = searchSymbols('茅台', 'stock');
    const fundResults = searchSymbols('茅台', 'fund');
    expect(stockResults.length).toBeGreaterThan(0);
    expect(fundResults.length).toBe(0);
  });
});
