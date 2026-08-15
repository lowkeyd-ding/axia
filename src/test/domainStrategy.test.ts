import { describe, it, expect } from 'vitest';
import { cloneStrategyVersion, createStrategyVersion, evaluateStrategy, validateStrategy } from '@/lib/domain/strategy';

describe('strategy model', () => {
  it('validates strategy boundaries', () => {
    expect(validateStrategy({ name: '成长', effectiveFrom: '2026-01-01', baseCurrency: 'CNY', targets: [{ category: 'stock', targetPercentage: 50 }] })).toBeNull();
    expect(validateStrategy({ name: '', effectiveFrom: '2026-01-01', baseCurrency: 'CNY', targets: [] })).toBeTruthy();
  });

  it('clones strategy as a new version', () => {
    const first = createStrategyVersion({
      name: '平衡',
      effectiveFrom: '2026-01-01',
      baseCurrency: 'CNY',
      includeCash: true,
      includeUnvaluedAssets: false,
      targets: [{ category: 'stock', targetPercentage: 40 }],
      reason: 'initial',
    });
    const second = cloneStrategyVersion(first, { reason: 'adjust cash' });
    expect(second.version).toBe(first.version + 1);
    expect(second.previousStrategyId).toBe(first.id);
  });

  it('evaluates deviation and completeness', () => {
    const strategy = createStrategyVersion({
      name: '平衡',
      effectiveFrom: '2026-01-01',
      baseCurrency: 'CNY',
      includeCash: true,
      includeUnvaluedAssets: false,
      targets: [
        { category: 'stock', targetPercentage: 60, minPercentage: 50, maxPercentage: 70 },
        { category: 'cash', targetPercentage: 40, minPercentage: 30, maxPercentage: 50 },
      ],
      reason: 'initial',
    });

    const result = evaluateStrategy({
      strategy,
      totalValue: 100,
      currentValues: { stock: 70, cash: 30 },
      missingCategories: [],
    });

    expect(result.complete).toBe(true);
    expect(result.deviations[0].category).toBe('stock');
    expect(result.deviations[0].deviationValue).toBe(10);
  });
});
