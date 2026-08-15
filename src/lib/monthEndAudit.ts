import type { Account, Position, Snapshot, Transfer } from '@/types';
import type { FxRates } from '@/lib/fx';
import { countMissingMonthEndSnapshots } from '@/lib/monthEndSnapshots';
import { getBusinessDate } from '@/lib/businessDate';

export function countDashboardMissingMonthEndSnapshots(input: {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  transfers: Transfer[];
  fxRates: FxRates;
}): number {
  const startDate = input.positions.reduce((start, position) => {
    const candidate = position.buyDate ? position.buyDate.slice(0, 10) : position.createdAt.slice(0, 10);
    return candidate < start ? candidate : start;
  }, getBusinessDate());

  return countMissingMonthEndSnapshots(
    {
      date: getBusinessDate(),
      accounts: input.accounts,
      positions: input.positions,
      trades: [],
      transfers: input.transfers,
      fxRates: input.fxRates,
      priceSnapshots: [],
    },
    startDate,
    new Set(input.snapshots.map((snapshot) => snapshot.date))
  );
}
