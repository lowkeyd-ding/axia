import { v4 as uuidv4 } from 'uuid';
import type { Account, AssetType, Position, Snapshot, Trade, Transfer } from '@/types';

export type ExcelRow = Record<string, unknown>;

export interface ExcelImportRows {
  accounts: ExcelRow[];
  positions: ExcelRow[];
  trades: ExcelRow[];
  transfers: ExcelRow[];
  snapshots: ExcelRow[];
}

export interface ExcelImportData {
  accounts: Account[];
  positions: Position[];
  trades: Trade[];
  transfers: Transfer[];
  snapshots: Snapshot[];
}

const ACCOUNT_TYPES: Record<string, Account['type']> = {
  bank: 'bank', securities: 'securities', fund: 'fund', other: 'other',
  银行: 'bank', 证券: 'securities', 基金: 'fund', 其他: 'other',
};
const ASSET_TYPES = new Set<AssetType>(['stock', 'fund', 'bank_wealth_management', 'bank_cash']);

function text(row: ExcelRow, key: string, fallback = ''): string {
  const value = row[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function numberValue(row: ExcelRow, key: string, fallback = 0): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : fallback;
}

function iso(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return fallback;
}

function assetType(value: string): AssetType {
  return ASSET_TYPES.has(value as AssetType) ? value as AssetType : 'stock';
}

function parsePercent(value: unknown): number {
  const parsed = Number(String(value ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function convertExcelRows(rows: ExcelImportRows, now = new Date().toISOString()): ExcelImportData {
  const accounts = rows.accounts.map((row, index): Account => {
    const name = text(row, '账户名称');
    if (!name) throw new Error(`账户表第 ${index + 2} 行缺少账户名称`);
    const rawType = text(row, '类型', 'other');
    return {
      id: text(row, '账户ID') || uuidv4(),
      name,
      type: ACCOUNT_TYPES[rawType] ?? 'other',
      institution: text(row, '机构') || undefined,
      holder: text(row, '持有人') || undefined,
      balance: numberValue(row, '余额'),
      currency: text(row, '币种', 'CNY').toUpperCase(),
      createdAt: iso(row['创建时间'], now),
      updatedAt: iso(row['更新时间'], now),
    };
  });
  const accountIds = new Set(accounts.map((account) => account.id));

  const positions = rows.positions.map((row, index): Position => {
    const accountId = text(row, '所属账户ID');
    if (!accountIds.has(accountId)) throw new Error(`持仓表第 ${index + 2} 行引用了不存在的账户`);
    const symbol = text(row, '代码');
    const name = text(row, '持仓名称');
    if (!symbol || !name) throw new Error(`持仓表第 ${index + 2} 行缺少名称或代码`);
    return {
      id: text(row, '持仓ID') || uuidv4(), accountId,
      assetType: assetType(text(row, '类型')),
      symbol, name,
      quantity: numberValue(row, '数量'), avgCost: numberValue(row, '成本价'), currentPrice: numberValue(row, '当前价'),
      currency: text(row, '币种') || undefined,
      buyDate: text(row, '买入日期') || undefined,
      createdAt: iso(row['创建时间'], now), updatedAt: iso(row['更新时间'], now),
    };
  });
  const positionIds = new Set(positions.map((position) => position.id));

  const trades = rows.trades.map((row, index): Trade => {
    const accountId = text(row, '账户ID');
    if (!accountIds.has(accountId)) throw new Error(`交易记录表第 ${index + 2} 行引用了不存在的账户`);
    const typeLabel = text(row, '类型');
    if (typeLabel !== '买入' && typeLabel !== '卖出' && typeLabel !== 'buy' && typeLabel !== 'sell') {
      throw new Error(`交易记录表第 ${index + 2} 行的交易类型无效`);
    }
    const quantity = numberValue(row, '数量');
    const price = numberValue(row, '价格');
    return {
      id: text(row, '交易ID') || uuidv4(), accountId,
      positionId: positionIds.has(text(row, '持仓ID')) ? text(row, '持仓ID') : undefined,
      assetType: assetType(text(row, '资产类型')),
      symbol: text(row, '代码'), name: text(row, '名称'),
      type: typeLabel === '买入' || typeLabel === 'buy' ? 'buy' : 'sell',
      quantity, price, total: numberValue(row, '总额', quantity * price), fees: numberValue(row, '手续费'),
      executedAt: iso(row['时间'], now), createdAt: iso(row['创建时间'], now),
    };
  });

  const transfers = rows.transfers.map((row, index): Transfer => {
    const fromAccountId = text(row, '转出账户ID') || (text(row, '转出账户') === '外部账户' ? 'external' : text(row, '转出账户'));
    const toAccountId = text(row, '转入账户ID') || (text(row, '转入账户') === '外部账户' ? 'external' : text(row, '转入账户'));
    if (fromAccountId !== 'external' && !accountIds.has(fromAccountId)) throw new Error(`资金转账表第 ${index + 2} 行引用了不存在的转出账户`);
    if (toAccountId !== 'external' && !accountIds.has(toAccountId)) throw new Error(`资金转账表第 ${index + 2} 行引用了不存在的转入账户`);
    return {
      id: text(row, '转账ID') || uuidv4(), fromAccountId, toAccountId,
      amount: numberValue(row, '金额'), currency: text(row, '币种', 'CNY'), note: text(row, '备注') || undefined,
      createdAt: iso(row['时间'], now),
    };
  });

  const snapshots = rows.snapshots.map((row): Snapshot => ({
    id: text(row, '快照ID') || uuidv4(), date: text(row, '日期'),
    totalValue: numberValue(row, '总价值'), cash: numberValue(row, '现金'), investments: numberValue(row, '投资'),
    dailyChange: numberValue(row, '日变化'), dailyChangePercent: parsePercent(row['日变化率']),
    totalChange: numberValue(row, '累计变化'), totalChangePercent: parsePercent(row['累计变化率']),
    allocations: [], accountValues: [], positionValues: [], note: text(row, '备注') || undefined,
    createdAt: iso(row['创建时间'], now),
  }));

  return { accounts, positions, trades, transfers, snapshots };
}
