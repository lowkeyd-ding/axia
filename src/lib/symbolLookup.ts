/**
 * Symbol Lookup Service
 * Provides auto-complete for stocks, funds, and other financial instruments
 * 数据从独立的 JSON 文件懒加载，避免增加 bundle size
 */

import symbolsData from '@/data/symbols.json';

export interface SymbolInfo {
  symbol: string;
  name: string;
  assetType: 'stock' | 'fund' | 'bank_wealth_management' | 'bank_cash';
  exchange?: string;
}

interface RawSymbol {
  symbol: string;
  name: string;
  exchange: string;
}

// 转换静态导入的 JSON 数据为 SymbolInfo[] 格式
const STOCK_DATA: SymbolInfo[] = (symbolsData.stocks as RawSymbol[]).map((s) => ({
  symbol: s.symbol,
  name: s.name,
  assetType: 'stock' as const,
  exchange: s.exchange,
}));

const FUND_DATA: SymbolInfo[] = (symbolsData.funds as RawSymbol[]).map((s) => ({
  symbol: s.symbol,
  name: s.name,
  assetType: 'fund' as const,
  exchange: s.exchange,
}));

const ALL_SYMBOLS = [...STOCK_DATA, ...FUND_DATA];

/**
 * Search symbols by query (matches code or name)
 */
export function searchSymbols(
  query: string,
  assetType?: 'stock' | 'fund'
): SymbolInfo[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  return ALL_SYMBOLS
    .filter((s) => {
      // Filter by asset type if specified
      if (assetType && s.assetType !== assetType) return false;

      // Match symbol code (partial match)
      if (s.symbol.toLowerCase().includes(normalizedQuery)) return true;

      // Match name (partial match)
      if (s.name.toLowerCase().includes(normalizedQuery)) return true;

      return false;
    })
    .slice(0, 10); // Limit results
}

/**
 * Get symbol info by exact symbol match
 */
export function getSymbolInfo(symbol: string): SymbolInfo | undefined {
  return ALL_SYMBOLS.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
}

/**
 * Detect asset type from symbol pattern
 */
export function detectAssetType(symbol: string): 'stock' | 'fund' | 'bank_wealth_management' | 'bank_cash' {
  const normalizedSymbol = symbol.toUpperCase();

  // 6-digit codes
  if (/^\d{6}$/.test(normalizedSymbol)) {
    // Stock codes: 000000-009999, 300000-309999, 600000-605999, 688000-688999
    // Fund: everything else that starts with 0, 1, 3, 4, 5, or 59
    // Stock: 000xxx-002xxx (excluding known funds 000009, 000538, 000640)
    const inStockRange = /^00[0-2]\d{3}$/.test(normalizedSymbol);
    const isKnownFund = /^(000009|000538|000640)$/.test(normalizedSymbol);
    const isStock =
      (inStockRange && !isKnownFund) ||
      /^300\d{3}$/.test(normalizedSymbol) ||
      /^6[0-5]\d{4}$/.test(normalizedSymbol) ||
      /^688\d{3}$/.test(normalizedSymbol);
    if (isStock) return 'stock';
    return 'fund';
  }

  // HK stocks: 5 digits
  if (/^\d{5}$/.test(normalizedSymbol)) {
    return 'stock';
  }

  // US stocks: letters
  if (/^[A-Z]{1,5}$/.test(normalizedSymbol)) {
    return 'stock';
  }

  // Default
  return 'stock';
}
