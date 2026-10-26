import type { CloudSyncData } from '@/lib/sync';

export type DurableDataValidation = { ok: true; data: CloudSyncData } | { ok: false; error: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateIdentifiedCollection(value: unknown, name: string): string | null {
  if (!Array.isArray(value)) return `${name} 必须是数组`;
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!record(item) || !validId(item.id)) return `${name}[${index}] 缺少有效 ID`;
    if (ids.has(item.id)) return `${name} 存在重复 ID：${item.id}`;
    ids.add(item.id);
  }
  return null;
}

export function validateCloudSyncData(value: unknown): DurableDataValidation {
  if (!record(value)) return { ok: false, error: '数据根节点必须是对象' };
  const required = ['accounts', 'positions', 'snapshots', 'trades', 'transfers', 'targetAllocations', 'lots'] as const;
  for (const key of required) {
    const error = validateIdentifiedCollection(value[key], key);
    if (error) return { ok: false, error };
  }
  for (const key of ['priceSnapshots', 'economicEvents', 'cashAdjustments'] as const) {
    if (value[key] !== undefined) {
      const error = validateIdentifiedCollection(value[key], key);
      if (error) return { ok: false, error };
    }
  }

  const accounts = value.accounts as Record<string, unknown>[];
  for (const [index, account] of accounts.entries()) {
    if (typeof account.name !== 'string' || !finite(account.balance) || typeof account.currency !== 'string') {
      return { ok: false, error: `accounts[${index}] 的名称、余额或币种无效` };
    }
  }
  const accountIds = new Set(accounts.map((item) => String(item.id)));
  const positions = value.positions as Record<string, unknown>[];
  for (const [index, position] of positions.entries()) {
    if (!accountIds.has(String(position.accountId))) return { ok: false, error: `positions[${index}] 引用了不存在的账户` };
    if (typeof position.symbol !== 'string' || !finite(position.quantity) || !finite(position.avgCost) || !finite(position.currentPrice)) {
      return { ok: false, error: `positions[${index}] 的代码、数量或价格无效` };
    }
  }
  const trades = value.trades as Record<string, unknown>[];
  for (const [index, trade] of trades.entries()) {
    if (!accountIds.has(String(trade.accountId))) return { ok: false, error: `trades[${index}] 引用了不存在的账户` };
    if ((trade.type !== 'buy' && trade.type !== 'sell') || !finite(trade.quantity) || !finite(trade.price) || !finite(trade.total) || !finite(trade.fees)) {
      return { ok: false, error: `trades[${index}] 的类型、数量或金额无效` };
    }
  }

  return {
    ok: true,
    data: {
      accounts: value.accounts,
      positions: value.positions,
      snapshots: value.snapshots,
      trades: value.trades,
      transfers: value.transfers,
      targetAllocations: value.targetAllocations,
      lots: value.lots,
      priceSnapshots: Array.isArray(value.priceSnapshots) ? value.priceSnapshots : [],
      economicEvents: Array.isArray(value.economicEvents) ? value.economicEvents : [],
      cashAdjustments: Array.isArray(value.cashAdjustments) ? value.cashAdjustments : [],
    } as CloudSyncData,
  };
}
