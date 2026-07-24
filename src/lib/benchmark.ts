export type BenchmarkCurrency = 'CNY' | 'USD' | 'HKD';

export interface BenchmarkSeriesPoint {
  date: string;
  value: number;
}

export interface BenchmarkSource {
  name: string;
  url: string;
  updatedAt: string;
}

export interface BenchmarkMeta {
  id: string;
  name: string;
  market: string;
  currency: BenchmarkCurrency;
  source: BenchmarkSource;
  historyComplete: boolean;
  disabledReason?: string;
}

export interface BenchmarkDataset extends BenchmarkMeta {
  series: BenchmarkSeriesPoint[];
}

export interface BenchmarkComparisonPoint {
  date: string;
  dateLabel: string;
  portfolio: number;
  benchmark: number;
}

export interface BenchmarkComparisonResult {
  points: BenchmarkComparisonPoint[];
  startDate: string;
  endDate: string;
  baseDate: string;
  source: BenchmarkSource;
  currency: BenchmarkCurrency;
}

export interface BenchmarkValidationResult {
  ok: boolean;
  reason?: string;
}

export const BENCHMARK_META: BenchmarkMeta[] = [
  {
    id: 'none',
    name: '无基准',
    market: 'N/A',
    currency: 'CNY',
    source: {
      name: '无',
      url: '',
      updatedAt: '',
    },
    historyComplete: false,
    disabledReason: '已关闭基准比较',
  },
  {
    id: 'csi300',
    name: '沪深300',
    market: '中国A股',
    currency: 'CNY',
    source: {
      name: '待接入的真实历史行情源',
      url: '',
      updatedAt: '',
    },
    historyComplete: false,
    disabledReason: '暂无可验证的基准历史数据',
  },
];

export function validateBenchmarkSeries(series: BenchmarkSeriesPoint[]): BenchmarkValidationResult {
  if (series.length === 0) {
    return { ok: false, reason: '暂无可验证的基准历史数据' };
  }

  const parsed = series.map((p) => ({ ...p, time: new Date(p.date).getTime() }));
  if (parsed.some((p) => !Number.isFinite(p.time) || !Number.isFinite(p.value))) {
    return { ok: false, reason: '基准数据包含无效日期或数值' };
  }

  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].time <= parsed[i - 1].time) {
      return { ok: false, reason: '基准日期必须严格递增' };
    }
    const prev = new Date(parsed[i - 1].time);
    const curr = new Date(parsed[i].time);
    const dayGap = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (dayGap > 10) {
      return { ok: false, reason: '基准日期区间不连续' };
    }
  }

  return { ok: true };
}

export function buildBenchmarkComparison(args: {
  benchmark: BenchmarkDataset;
  portfolioPoints: { date: string; dateLabel: string; portfolio: number }[];
  portfolioCurrency: BenchmarkCurrency;
}): BenchmarkComparisonResult | null {
  const { benchmark, portfolioPoints, portfolioCurrency } = args;
  if (!benchmark.historyComplete) return null;
  if (benchmark.currency !== portfolioCurrency) return null;
  const validation = validateBenchmarkSeries(benchmark.series);
  if (!validation.ok) return null;
  if (portfolioPoints.length === 0) return null;

  const portfolioByDate = new Map(portfolioPoints.map((p) => [p.date.slice(0, 10), p]));
  const benchmarkByDate = new Map(benchmark.series.map((p) => [p.date.slice(0, 10), p]));
  const sharedDates = portfolioPoints
    .map((p) => p.date.slice(0, 10))
    .filter((d) => benchmarkByDate.has(d));

  if (sharedDates.length < 2) return null;

  const startDate = sharedDates[0];
  const endDate = sharedDates[sharedDates.length - 1];
  const basePortfolio = portfolioByDate.get(startDate);
  const baseBenchmark = benchmarkByDate.get(startDate);
  if (!basePortfolio || !baseBenchmark) return null;

  const points: BenchmarkComparisonPoint[] = [];
  for (const date of sharedDates) {
    const p = portfolioByDate.get(date);
    const b = benchmarkByDate.get(date);
    if (!p || !b) continue;
    points.push({
      date,
      dateLabel: p.dateLabel,
      portfolio: Number((p.portfolio - basePortfolio.portfolio).toFixed(2)),
      benchmark: Number(((b.value / baseBenchmark.value - 1) * 100).toFixed(2)),
    });
  }

  if (points.length < 2) return null;

  return {
    points,
    startDate,
    endDate,
    baseDate: startDate,
    source: benchmark.source,
    currency: benchmark.currency,
  };
}
