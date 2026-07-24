import type { AssetType, TargetAllocation } from '@/types';

export type AllocationCategory = AssetType | 'cash';

export const ALLOCATION_CATEGORIES: Array<{ category: AllocationCategory; label: string }> = [
  { category: 'stock', label: '股票' },
  { category: 'fund', label: '基金' },
  { category: 'bank_wealth_management', label: '银行理财' },
  { category: 'bank_cash', label: '现金' },
];

export interface AllocationDeviation {
  category: AllocationCategory;
  label: string;
  currentPercentage: number;
  targetPercentage: number;
  deviation: number;
  status: '高于目标' | '低于目标' | '接近目标';
}

export function validateTargetAllocation(allocation: Pick<TargetAllocation, 'name' | 'allocations'>): string | null {
  if (!allocation.name.trim()) return '请输入目标配置名称。';
  let total = 0;
  for (const item of allocation.allocations) {
    if (!Number.isFinite(item.percentage) || item.percentage < 0 || item.percentage > 100) {
      return '每项目标比例必须是 0–100% 之间的有效数字。';
    }
    total += item.percentage;
  }
  if (total > 100 + Number.EPSILON) return '目标比例合计不能超过 100%。';
  return null;
}

export function validateAllocationRows(
  rows: Array<{ category: AllocationCategory; percentage: number }>
): string | null {
  return validateTargetAllocation({ name: 'rows', allocations: rows });
}

export function calculateAllocationDeviations(
  current: Partial<Record<AllocationCategory, number>>,
  allocation: TargetAllocation
): AllocationDeviation[] {
  const deviations: AllocationDeviation[] = allocation.allocations.map((item) => {
    const category = item.category as AllocationCategory;
    const label = ALLOCATION_CATEGORIES.find((candidate) => candidate.category === category)?.label ?? item.category;
    const currentPercentage = current[category] ?? 0;
    const deviation = currentPercentage - item.percentage;
    const status = (deviation > 0.01
      ? '高于目标'
      : deviation < -0.01
        ? '低于目标'
        : '接近目标') as AllocationDeviation['status'];
    return {
      category,
      label,
      currentPercentage,
      targetPercentage: item.percentage,
      deviation,
      status,
    };
  });

  return deviations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

export function formatAllocationDeviation(deviation: AllocationDeviation): string {
  const diff = Math.abs(deviation.deviation).toFixed(2);
  if (deviation.status === '高于目标') return `高于目标 ${diff}%`;
  if (deviation.status === '低于目标') return `低于目标 ${diff}%`;
  return '偏离较大';
}
