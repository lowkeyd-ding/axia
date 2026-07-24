import { describe, it, expect } from 'vitest';
import {
  buildBenchmarkComparison,
  validateBenchmarkSeries,
  BENCHMARK_META,
} from '@/lib/benchmark';

const portfolioPoints = [
  { date: '2026-07-01', dateLabel: '7/1', portfolio: 0 },
  { date: '2026-07-02', dateLabel: '7/2', portfolio: 2 },
  { date: '2026-07-03', dateLabel: '7/3', portfolio: 4 },
];

const benchmark = {
  id: 'csi300',
  name: '沪深300',
  market: '中国A股',
  currency: 'CNY' as const,
  source: { name: '交易所历史行情', url: 'https://example.com', updatedAt: '2026-07-04T00:00:00.000Z' },
  historyComplete: true,
  series: [
    { date: '2026-07-01', value: 100 },
    { date: '2026-07-02', value: 101 },
    { date: '2026-07-03', value: 103 },
  ],
};

describe('benchmark data validation', () => {
  it('rejects missing benchmark data', () => {
    const result = validateBenchmarkSeries([]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('暂无可验证的基准历史数据');
  });

  it('rejects non-continuous dates', () => {
    const result = validateBenchmarkSeries([
      { date: '2026-07-01', value: 100 },
      { date: '2026-07-20', value: 105 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects currency mismatch by comparison gating', () => {
    const result = buildBenchmarkComparison({
      benchmark: { ...benchmark, currency: 'USD' },
      portfolioPoints,
      portfolioCurrency: 'CNY',
    });
    expect(result).toBeNull();
  });

  it('returns null when dates do not overlap enough', () => {
    const result = buildBenchmarkComparison({
      benchmark: { ...benchmark, series: [{ date: '2026-06-01', value: 100 }] },
      portfolioPoints,
      portfolioCurrency: 'CNY',
    });
    expect(result).toBeNull();
  });

  it('builds comparable data for matching dates and currency', () => {
    const result = buildBenchmarkComparison({ benchmark, portfolioPoints, portfolioCurrency: 'CNY' });
    expect(result?.points).toHaveLength(3);
    expect(result?.startDate).toBe('2026-07-01');
    expect(result?.baseDate).toBe('2026-07-01');
    expect(result?.currency).toBe('CNY');
  });
});

describe('benchmark metadata', () => {
  it('exposes source and completeness status', () => {
    expect(BENCHMARK_META[0]).toHaveProperty('name');
    expect(BENCHMARK_META[0]).toHaveProperty('source');
    expect(BENCHMARK_META[0]).toHaveProperty('historyComplete');
  });
});
