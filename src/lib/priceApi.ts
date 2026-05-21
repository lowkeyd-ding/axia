/**
 * Client-side Price API
 * Calls our server-side proxy to fetch stock prices
 */

export interface PriceData {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  timestamp: string;
  source: 'realtime' | 'fund' | 'manual';
}

export interface RefreshPricesResult {
  success: boolean;
  prices?: PriceData[];
  errors?: string[];
}

// Mock fallback data
const MOCK_PRICES: Record<string, { price: number; change: number; name: string }> = {
  '000002': { price: 7.15, change: -0.08, name: '万科A' },
  '000001': { price: 11.23, change: 0.15, name: '平安银行' },
  '600519': { price: 1688.00, change: 12.50, name: '贵州茅台' },
  '600036': { price: 35.82, change: 0.28, name: '招商银行' },
  '601318': { price: 45.67, change: 0.78, name: '中国平安' },
  '000858': { price: 142.50, change: 2.30, name: '五粮液' },
  '002594': { price: 245.67, change: 3.45, name: '比亚迪' },
  '300750': { price: 198.76, change: -2.34, name: '宁德时代' },
  '00700': { price: 368.00, change: 5.20, name: '腾讯控股' },
  'AAPL': { price: 178.50, change: 1.23, name: 'Apple Inc.' },
};

/**
 * Check if symbol is a fund based on pattern
 */
export function isFundSymbol(symbol: string): boolean {
  if (/^\d{6}$/.test(symbol)) {
    return /^(1[56]|4[789]|5[19]|59)\d{3}$/.test(symbol);
  }
  return false;
}

/**
 * Get price for a single symbol
 */
export async function getPrice(symbol: string): Promise<PriceData | null> {
  const upper = symbol.toUpperCase();

  try {
    const response = await fetch(`/api/price?symbols=${upper}`);
    const data = await response.json();
    
    if (data.prices && data.prices.length > 0) {
      return data.prices[0] as PriceData;
    }
  } catch {
    // Fall through to fallback
  }

  // Use mock data as fallback
  const mockData = MOCK_PRICES[upper];
  if (mockData) {
    return {
      symbol: upper,
      name: mockData.name,
      price: mockData.price,
      change: mockData.change,
      changePercent: (mockData.change / (mockData.price - mockData.change)) * 100,
      prevClose: mockData.price - mockData.change,
      timestamp: new Date().toISOString(),
      source: 'manual'
    };
  }

  return null;
}

/**
 * Batch refresh prices for multiple symbols
 */
export async function refreshPrices(symbols: string[]): Promise<RefreshPricesResult> {
  if (symbols.length === 0) {
    return { success: true, prices: [] };
  }

  try {
    const symbolsParam = symbols.map(s => s.toUpperCase()).join(',');
    const response = await fetch(`/api/price?symbols=${symbolsParam}`);
    const data = await response.json();

    if (data.prices) {
      return {
        success: !data.errors || data.errors.length === 0,
        prices: data.prices as PriceData[],
        errors: data.errors
      };
    }
  } catch (error) {
    console.error('Price API error:', error);
  }

  return { success: false, errors: ['无法获取价格数据'] };
}

/**
 * Batch refresh prices by asset type
 */
export async function refreshPricesByType(
  symbols: string[],
  _assetTypes: ('stock' | 'fund')[]
): Promise<RefreshPricesResult> {
  return refreshPrices(symbols);
}
