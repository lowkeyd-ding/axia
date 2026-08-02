// Account types
export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'securities' | 'fund' | 'other';
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
export interface PriceSnapshot {
  id: string;
  symbol: string;
  assetType: 'stock' | 'fund';
  date: string;
  price: number;
  currency: string;
  source: string;
  dataTier?: 'realtime' | 'estimate' | 'confirmed' | 'cached' | 'stale';
  createdAt: string;
}

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
  currency?: string; // 持仓币种，如果不填则使用账户币种
  buyDate?: string; // 买入日期 YYYY-MM-DD
  // Period baseline prices for P&L calculation — captured ONCE when period changes, then locked
  dailyBasePrice?: number;     // 今日基准价，写入后当日不再变化
  monthlyBasePrice?: number;   // 本月基准价，写入后当月不再变化
  yearlyBasePrice?: number;    // 本年基准价，写入后本年不再变化
  dailyBaseDate?: string;      // 今日基准日期 YYYY-MM-DD（等于当天日期才有效）
  monthlyBaseMonth?: string;   // 本月基准月份 YYYY-MM
  yearlyBaseYear?: string;     // 本年基准年份 YYYY
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

// Lot types — individual buy lots for P&L tracking per buy point
export interface Lot {
  id: string;
  positionId: string;
  quantity: number;         // 原买入数量
  remainingQuantity: number; // 剩余未卖出数量
  price: number;            // 买入价格
  fees: number;             // 买入手续费
  executedAt: string;       // 买入时间
  createdAt: string;
  deletedAt?: string;       // 清仓后软删除
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

// Transfer types (资金转入转出)
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  note?: string;
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
