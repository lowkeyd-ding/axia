import type { Account, AssetType, Position, Snapshot, TargetAllocation, Trade } from '@/types';
import { calculateAllocationDeviations, validateTargetAllocation as validateTargetConfig, type AllocationCategory } from './targetAllocation';

export const TARGET_CATEGORIES: Array<{ category: AllocationCategory; label: string }> = [
  { category: 'stock', label: '股票' },
  { category: 'fund', label: '基金' },
  { category: 'bank_wealth_management', label: '银行理财' },
  { category: 'cash', label: '现金' },
];

export interface AllocationDeviation {
  category: string;
  currentPercentage: number;
  targetPercentage: number;
  deviation: number;
}

export function validateTargetAllocation(allocations: TargetAllocation['allocations']): string | null {
  return validateTargetConfig({ name: '配置', allocations });
}

export function getAllocationDeviations(
  current: Record<string, number>,
  allocation?: TargetAllocation
): AllocationDeviation[] {
  if (!allocation) return [];
  return calculateAllocationDeviations(current as Partial<Record<AllocationCategory, number>>, allocation).map((item) => ({
    category: item.category,
    currentPercentage: item.currentPercentage,
    targetPercentage: item.targetPercentage,
    deviation: item.deviation,
  }));
}

export interface DataHealthIssue {
  id: string;
  count: number;
  description: string;
  href: string;
}

const invalidNumber = (value: number) => !Number.isFinite(value) || Number.isNaN(value);

export function inspectDataHealth({
  accounts,
  positions,
  trades,
  snapshots,
  targetAllocations,
}: {
  accounts: Account[];
  positions: Position[];
  trades: Trade[];
  snapshots: Snapshot[];
  targetAllocations: TargetAllocation[];
}): DataHealthIssue[] {
  const accountIds = new Set(accounts.map((a) => a.id));
  const positionIds = new Set(positions.map((p) => p.id));
  const issues: DataHealthIssue[] = [];
  const add = (id: string, count: number, description: string, href: string) =>
    count > 0 && issues.push({ id, count, description, href });

  add('orphan-positions', positions.filter((p) => !accountIds.has(p.accountId)).length, '持仓引用了不存在的账户。', '/positions');
  add('orphan-trades', trades.filter((t) => !accountIds.has(t.accountId) || (t.positionId && !positionIds.has(t.positionId))).length, '交易引用了不存在的账户或持仓。', '/trades');
  add('position-quantity', positions.filter((p) => !Number.isFinite(p.quantity) || p.quantity <= 0).length, '存在数量小于等于 0 或无效的持仓。', '/positions');
  add('invalid-values', [...accounts.map((a) => a.balance), ...positions.flatMap((p) => [p.avgCost, p.currentPrice])].filter(invalidNumber).length, '余额、成本或价格存在负值或无效数字。', '/accounts');
  add('missing-currency', positions.filter((p) => !p.currency && !accounts.find((a) => a.id === p.accountId)?.currency).length, '部分资产缺少币种信息。', '/positions');

  const dates = snapshots.map((s) => s.date);
  add('snapshot-dates', dates.filter((date, i) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || dates.indexOf(date) !== i).length, '快照日期存在重复或无效值。', '/snapshots');
  add('target-allocation', targetAllocations.filter((a) => Boolean(validateTargetAllocation(a.allocations))).length, '目标配置比例存在异常。', '/accounts');
  return issues;
}

export function summarizeDataHealth(issues: DataHealthIssue[]) {
  return issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.id] = issue.count;
    return acc;
  }, {});
}
