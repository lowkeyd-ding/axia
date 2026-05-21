// Account types
export interface Account {
  id: string;
  name: string;
  type: 'brokerage' | 'retirement' | 'savings' | 'cash';
  institution?: string;
  holder?: string;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

// Asset types
export type AssetType = 'stock' | 'fund' | 'bank_wealth_management' | 'bank_cash';

// Position types
export interface Position {
  id: string;
  accountId: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  createdAt: string;
  updatedAt: string;
}

// Asset type configuration
export const ASSET_TYPE_CONFIG: Record<AssetType, { label: string; icon: string; color: string }> = {
  stock: { label: '股票', icon: '📈', color: 'text-blue-600 bg-blue-100 border-blue-200' },
  fund: { label: '基金', icon: '📊', color: 'text-purple-600 bg-purple-100 border-purple-200' },
  bank_wealth_management: { label: '银行理财', icon: '🏦', color: 'text-amber-600 bg-amber-100 border-amber-200' },
  bank_cash: { label: '现金', icon: '💰', color: 'text-emerald-600 bg-emerald-100 border-emerald-200' },
};

// Snapshot types
export interface Snapshot {
  id: string;
  date: string;
  totalValue: number;
  cash: number;
  investments: number;
  dailyChange: number;
  dailyChangePercent: number;
  totalChange: number; // Change from first snapshot
  totalChangePercent: number;
  allocations: AssetAllocation[];
  accountValues: AccountValue[];
  positionValues: PositionValue[]; // Detailed position values
  note?: string;
  createdAt: string;
}

export interface AssetAllocation {
  type: AssetType;
  value: number;
  percentage: number;
}

export interface AccountValue {
  accountId: string;
  accountName: string;
  currency: string;
  value: number;
  cash: number;
  investments: number;
}

export interface PositionValue {
  positionId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

// Trade types
export interface Trade {
  id: string;
  accountId: string;
  positionId?: string; // Optional link to position for updates
  assetType: AssetType;
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  fees: number;
  executedAt: string;
  createdAt: string;
}

// Trade execution result
export interface TradeExecutionResult {
  success: boolean;
  trade?: Trade;
  position?: Position;
  accountBalance?: number;
  error?: string;
}

// Target allocation types
export interface TargetAllocation {
  id: string;
  name: string;
  description?: string;
  allocations: AllocationTarget[];
  createdAt: string;
  updatedAt: string;
}

export interface AllocationTarget {
  category: string;
  percentage: number;
}

// Action result types
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
