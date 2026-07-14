/**
 * Client-side Price API
 * Calls external price sources directly for static export compatibility.
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
    // Stock codes: 000001-009999, 300000-309999, 600000-605999, 688000-688999
    // Fund: everything else that starts with 0, 1, 3, 4, 5, or 59
    // Stock: 000xxx-002xxx (excluding known funds 000009, 000538, 000640)
    const inStockRange = /^00[0-2]\d{3}$/.test(symbol);
    const isKnownFund = /^(000009|000538|000640)$/.test(symbol);
    const isStock =
      (inStockRange && !isKnownFund) ||
      /^300\d{3}$/.test(symbol) ||
      /^6[0-5]\d{4}$/.test(symbol) ||
      /^688\d{3}$/.test(symbol);
    return !isStock;
  }
  return false;
}

/**
 * Get price for a single symbol
 */
export async function getPrice(symbol: string): Promise<PriceData | null> {
  const upper = symbol.toUpperCase();

  try {
    const prices = await refreshPrices([upper]);
    if (prices.prices && prices.prices.length > 0) {
      return prices.prices[0];
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
    const prices = await Promise.all(
      symbols.map(async (symbol) => {
        const result = await fetchSymbol(symbol);
        return { symbol, result };
      })
    );

    const results: PriceData[] = [];
    const errors: string[] = [];

    for (const { symbol, result } of prices) {
      if (result) {
        results.push(result);
      } else {
        const mock = MOCK_PRICES[symbol.toUpperCase()];
        if (mock) {
          results.push({
            symbol: symbol.toUpperCase(),
            name: mock.name,
            price: mock.price,
            change: mock.change,
            changePercent: (mock.change / (mock.price - mock.change)) * 100,
            prevClose: mock.price - mock.change,
            open: mock.price,
            high: mock.price,
            low: mock.price,
            volume: 0,
            timestamp: new Date().toISOString(),
            source: 'manual'
          });
        } else {
          errors.push(`无法获取 ${symbol}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      prices: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('Price API error:', error);
    return { success: false, errors: ['无法获取价格数据'] };
  }
}

/**
 * Batch refresh prices by asset type
 */
export async function refreshPricesByType(
  symbols: string[],
  _assetTypes: ('stock' | 'fund')[]
): Promise<RefreshPricesResult> {
  void _assetTypes;
  return refreshPrices(symbols);
}

async function fetchSymbol(symbol: string): Promise<PriceData | null> {
  const { fetchSymbol: externalFetch } = await import('@/lib/externalPriceApi');
  return externalFetch(symbol);
}
