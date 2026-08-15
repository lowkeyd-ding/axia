import type { AssetType } from '@/types';
import type { CurrencyCode } from './money';
import { getBusinessDate } from './businessDate';

export type PriceObservationKind = 'closing' | 'intraday' | 'manual';
export type PriceObservationStatus = 'valid' | 'stale' | 'invalid';

export interface PriceObservation {
  id: string;
  symbol: string;
  assetType: AssetType;
  price: number;
  currency: CurrencyCode;
  observedAt: string;
  fetchedAt: string;
  source: string;
  kind: PriceObservationKind;
  status: PriceObservationStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface HistoricalValuationResult {
  symbol: string;
  asOfDate: string;
  price?: number;
  currency?: CurrencyCode;
  sourceObservationId?: string;
  complete: boolean;
  missingReason?: string;
}

export function normalizeObservation(observation: PriceObservation): PriceObservation {
  return {
    ...observation,
    symbol: observation.symbol.toUpperCase(),
  };
}

export function currentPriceFromObservations(observations: PriceObservation[]): PriceObservation | null {
  const valid = observations
    .filter((item) => item.status === 'valid' && item.price > 0)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.fetchedAt.localeCompare(a.fetchedAt));
  return valid[0] || null;
}

export function historicalValuationAt(
  symbol: string,
  asOfDate: string,
  observations: PriceObservation[]
): HistoricalValuationResult {
  const sorted = [...observations]
    .filter((item) => item.symbol.toUpperCase() === symbol.toUpperCase())
    .filter((item) => item.status === 'valid' && item.price > 0)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.fetchedAt.localeCompare(a.fetchedAt));

  const hit = sorted.find((item) => item.observedAt.slice(0, 10) <= asOfDate);
  if (!hit) {
    return {
      symbol: symbol.toUpperCase(),
      asOfDate,
      complete: false,
      missingReason: `缺少 ${asOfDate} 及之前的有效价格观测`,
    };
  }

  return {
    symbol: symbol.toUpperCase(),
    asOfDate,
    price: hit.price,
    currency: hit.currency,
    sourceObservationId: hit.id,
    complete: true,
  };
}

export function createPriceObservation(input: Omit<PriceObservation, 'symbol' | 'fetchedAt'> & { symbol: string; fetchedAt?: string }): PriceObservation {
  return {
    ...input,
    symbol: input.symbol.toUpperCase(),
    fetchedAt: input.fetchedAt || new Date().toISOString(),
  };
}

export function createHistoricalValuationSummary(symbol: string, observations: PriceObservation[]): HistoricalValuationResult {
  return historicalValuationAt(symbol, getBusinessDate(), observations);
}
