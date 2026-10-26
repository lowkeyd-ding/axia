import type { Account, CashAdjustment, Lot, Position, PriceSnapshot, Snapshot, TargetAllocation, Trade, Transfer } from '@/types';
import type { EconomicEvent } from '@/lib/domain/events';
import type { CloudSyncData } from '@/lib/sync';

export interface SerializableStoreState {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  targetAllocations: TargetAllocation[];
  lots: Lot[];
  priceSnapshots: PriceSnapshot[];
  economicEvents: EconomicEvent[];
  cashAdjustments: CashAdjustment[];
}

/**
 * The single source of truth for data that must survive export, sign-out and
 * cross-device cloud sync. Keep additions to the store's durable model here.
 */
export function serializeStoreState(state: SerializableStoreState): CloudSyncData {
  return {
    accounts: state.accounts,
    positions: state.positions,
    snapshots: state.snapshots,
    trades: state.trades,
    transfers: state.transfers,
    targetAllocations: state.targetAllocations,
    lots: state.lots,
    priceSnapshots: state.priceSnapshots,
    economicEvents: state.economicEvents,
    cashAdjustments: state.cashAdjustments,
  };
}
