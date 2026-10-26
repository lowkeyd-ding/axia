'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '@/types';
import { BENCHMARK_META, buildBenchmarkComparison, type BenchmarkComparisonResult, type BenchmarkSeriesPoint } from '@/lib/benchmark';

interface HistoryResponse { results?: Array<{ points?: Array<{ date: string; close: number }> }> }

export function useBenchmarkComparison(snapshots: Snapshot[]) {
  const [series, setSeries] = useState<BenchmarkSeriesPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ordered = useMemo(() => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)), [snapshots]);
  const start = ordered[0]?.date;
  const end = ordered.at(-1)?.date;

  useEffect(() => {
    if (!start || !end || start >= end) return;
    const controller = new AbortController();
    fetch(`/api/history?symbols=000300.SH&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<HistoryResponse> : Promise.reject(new Error('基准行情请求失败')))
      .then((body) => {
        setSeries((body.results?.[0]?.points || []).map((point) => ({ date: point.date, value: point.close })));
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : '基准行情请求失败');
      });
    return () => controller.abort();
  }, [start, end]);

  const comparison = useMemo<BenchmarkComparisonResult | null>(() => {
    if (ordered.length < 2 || series.length === 0) return null;
    const base = ordered[0].totalValue;
    if (base <= 0) return null;
    return buildBenchmarkComparison({
      benchmark: { ...BENCHMARK_META.find((item) => item.id === 'csi300')!, series, source: { name: '东方财富历史行情', url: 'https://quote.eastmoney.com/zs000300.html', updatedAt: new Date().toISOString() } },
      portfolioPoints: ordered.map((snapshot) => ({ date: snapshot.date, dateLabel: snapshot.date, portfolio: ((snapshot.totalValue / base) - 1) * 100 })),
      portfolioCurrency: 'CNY',
    });
  }, [ordered, series]);

  return { comparison, error, loading: Boolean(start && end && !comparison && !error) };
}
