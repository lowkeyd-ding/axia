import { describe, it, expect } from 'vitest';
import { priceDataToObservation } from '@/lib/domain/priceObservationAdapters';

describe('price observation adapters', () => {
  it('maps price data to a valid observation', () => {
    const observation = priceDataToObservation({
      symbol: '600519',
      price: 100,
      change: 2,
      changePercent: 2,
      timestamp: '2026-01-02T10:00:00.000Z',
      source: 'realtime',
      dataTier: 'realtime',
      sourceLabel: 'Sina',
      name: '贵州茅台',
    } as any, 'stock');

    expect(observation.symbol).toBe('600519');
    expect(observation.status).toBe('valid');
    expect(observation.kind).toBe('manual');
  });
});
