import type { AssetType } from '@/types';
import type { CurrencyCode } from './money';

export type StrategyCategory = AssetType | 'cash';

export interface StrategyTarget {
  category: StrategyCategory;
  targetPercentage: number;
  minPercentage?: number;
  maxPercentage?: number;
}

export interface StrategyVersion {
  id: string;
  name: string;
  effectiveFrom: string;
  baseCurrency: CurrencyCode;
  includeCash: boolean;
  includeUnvaluedAssets: boolean;
  targets: StrategyTarget[];
  reason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  previousStrategyId?: string;
}

export interface StrategyDeviation {
  category: StrategyCategory;
  currentValue: number;
  currentPercentage: number;
  targetPercentage: number;
  deviationValue: number;
  deviationPercentage: number;
  withinRange: boolean;
}

export interface StrategyEvaluationResult {
  strategy?: StrategyVersion;
  totalValue: number;
  baseCurrency: CurrencyCode;
  complete: boolean;
  missingCategories: StrategyCategory[];
  deviations: StrategyDeviation[];
}

export function validateStrategy(strategy: Pick<StrategyVersion, 'name' | 'effectiveFrom' | 'baseCurrency' | 'targets'>): string | null {
  if (!strategy.name.trim()) return '请输入策略名称。';
  if (!strategy.effectiveFrom.trim()) return '请输入策略生效日期。';
  if (!strategy.baseCurrency.trim()) return '请输入基准币种。';
  let total = 0;
  for (const target of strategy.targets) {
    if (!Number.isFinite(target.targetPercentage) || target.targetPercentage < 0 || target.targetPercentage > 100) {
      return '目标比例必须是 0–100% 之间的有效数字。';
    }
    if (target.minPercentage !== undefined && target.maxPercentage !== undefined && target.minPercentage > target.maxPercentage) {
      return '最低比例不能高于最高比例。';
    }
    total += target.targetPercentage;
  }
  if (total > 100 + Number.EPSILON) return '策略目标比例合计不能超过 100%。';
  return null;
}

export function createStrategyVersion(input: Omit<StrategyVersion, 'id' | 'version' | 'createdAt' | 'updatedAt'> & { id?: string; version?: number; createdAt?: string; updatedAt?: string }): StrategyVersion {
  return {
    ...input,
    id: input.id || crypto.randomUUID(),
    version: input.version || 1,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function cloneStrategyVersion(previous: StrategyVersion, changes: Partial<Omit<StrategyVersion, 'id' | 'version' | 'createdAt' | 'updatedAt'>>): StrategyVersion {
  return {
    ...previous,
    ...changes,
    id: crypto.randomUUID(),
    version: previous.version + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    previousStrategyId: previous.id,
  };
}

export function evaluateStrategy(params: {
  strategy?: StrategyVersion;
  totalValue: number;
  currentValues: Partial<Record<StrategyCategory, number>>;
  missingCategories?: StrategyCategory[];
}): StrategyEvaluationResult {
  const strategy = params.strategy;
  const totalValue = params.totalValue;
  const missingCategories = params.missingCategories || [];
  const complete = missingCategories.length === 0;

  const deviations: StrategyDeviation[] = strategy
    ? strategy.targets.map((target) => {
        const currentValue = params.currentValues[target.category] ?? 0;
        const currentPercentage = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const deviationPercentage = currentPercentage - target.targetPercentage;
        const deviationValue = currentValue - (totalValue * target.targetPercentage) / 100;
        const withinRange =
          (target.minPercentage === undefined || currentPercentage >= target.minPercentage) &&
          (target.maxPercentage === undefined || currentPercentage <= target.maxPercentage);
        return {
          category: target.category,
          currentValue,
          currentPercentage,
          targetPercentage: target.targetPercentage,
          deviationValue,
          deviationPercentage,
          withinRange,
        };
      })
    : [];

  return {
    strategy,
    totalValue,
    baseCurrency: strategy?.baseCurrency || 'CNY',
    complete,
    missingCategories,
    deviations: deviations.sort((a, b) => Math.abs(b.deviationPercentage) - Math.abs(a.deviationPercentage)),
  };
}
