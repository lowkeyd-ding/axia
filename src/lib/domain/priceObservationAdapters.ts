import type { PriceData } from '@/lib/priceApi';
import type { PriceSnapshot } from '@/types';
import { createPriceObservation, type PriceObservation } from './priceObservation';
import { getBusinessDate } from './businessDate';

export function priceDataToObservation(input: PriceData, assetType: PriceSnapshot['assetType']): PriceObservation {
  return createPriceObservation({
    id: `${input.symbol}-${input.timestamp}`,
    symbol: input.symbol,
    assetType,
    price: input.price,
    currency: 'CNY',
    observedAt: input.observedAt || input.timestamp,
    fetchedAt: input.fetchedAt || new Date().toISOString(),
    source: input.sourceLabel || input.source,
    kind: input.isClosingPrice ? 'closing' : input.dataTier === 'estimate' ? 'intraday' : 'manual',
    status: input.valid === false ? 'invalid' : input.dataTier === 'stale' ? 'stale' : 'valid',
    errorMessage: input.errorMessage,
    metadata: {
      name: input.name,
      change: input.change,
      changePercent: input.changePercent,
      prevClose: input.prevClose,
      timestamp: input.timestamp,
      businessDate: getBusinessDate(),
    },
  });
}

export function priceSnapshotToObservation(snapshot: PriceSnapshot): PriceObservation {
  return createPriceObservation({
    id: snapshot.id,
    symbol: snapshot.symbol,
    assetType: snapshot.assetType,
    price: snapshot.price,
    currency: snapshot.currency as PriceObservation['currency'],
    observedAt: snapshot.date,
    fetchedAt: snapshot.createdAt,
    source: snapshot.source,
    kind: snapshot.dataTier === 'confirmed' ? 'closing' : snapshot.dataTier === 'estimate' ? 'intraday' : 'manual',
    status: snapshot.dataTier === 'stale' ? 'stale' : 'valid',
  });
}
