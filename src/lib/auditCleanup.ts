import type { Account, Position, Snapshot, Trade, Transfer, PriceSnapshot } from '@/types';
import type { FxRates } from '@/lib/fx';
import { auditDirtyHoldings, auditDirtyMonths, auditDirtyTrades, buildDirtyAuditReport } from '@/lib/dirtyAudit';
import { buildMonthEndSnapshot, buildMissingMonthEndSnapshots, listMonthEndDates } from '@/lib/monthEndSnapshots';

export interface CleanupResult {
  report: ReturnType<typeof buildDirtyAuditReport>;
  rebuiltSnapshots: Snapshot[];
  rebuiltPriceSnapshots: PriceSnapshot[];
}

function toDateKey(date: string): string {
  return date.slice(0, 10);
}

function asOfStartDate(positions: Position[]): string {
  return positions.reduce((start, position) => {
    const candidate = position.buyDate ? position.buyDate.slice(0, 10) : position.createdAt.slice(0, 10);
    return candidate < start ? candidate : start;
  }, new Date().toISOString().slice(0, 10));
}

export async function cleanupAndRebuildData(input: {
  accounts: Account[];
  positions: Position[];
  snapshots: Snapshot[];
  trades: Trade[];
  transfers: Transfer[];
  priceSnapshots: PriceSnapshot[];
  fxRates: FxRates;
}): Promise<CleanupResult> {
  const report = buildDirtyAuditReport({
    accounts: input.accounts,
    positions: input.positions,
    snapshots: input.snapshots,
    trades: input.trades,
    transfers: input.transfers,
  });

  const startDate = asOfStartDate(input.positions);
  const endDate = toDateKey(new Date().toISOString());
  const existingDates = new Set(input.snapshots.map((snapshot) => snapshot.date));
  const rebuiltSnapshots = buildMissingMonthEndSnapshots(
    {
      date: endDate,
      accounts: input.accounts,
      positions: input.positions,
      trades: input.trades,
      transfers: input.transfers,
      fxRates: input.fxRates,
      priceSnapshots: input.priceSnapshots as never,
    },
    startDate,
    existingDates
  );

  const syntheticMonths = listMonthEndDates(startDate, endDate);
  const rebuiltPriceSnapshots = input.priceSnapshots.filter((snapshot) => snapshot.dataTier === 'confirmed' || syntheticMonths.includes(snapshot.date)).concat(
    input.positions.flatMap((position) => {
      return syntheticMonths
        .filter((date) => date >= (position.buyDate ? position.buyDate.slice(0, 10) : position.createdAt.slice(0, 10)))
        .map((date) => {
          const monthEnd = buildMonthEndSnapshot({
            date,
            accounts: input.accounts,
            positions: [position],
            trades: input.trades,
            transfers: input.transfers,
            fxRates: input.fxRates,
            priceSnapshots: input.priceSnapshots as never,
          });
          if (!monthEnd) return null;
          return {
            id: `${position.id}-${date}`,
            symbol: position.symbol,
            assetType: position.assetType,
            date,
            price: monthEnd.positionValues.find((item) => item.positionId === position.id)?.currentPrice ?? position.currentPrice,
            currency: position.currency || 'CNY',
            source: 'rebuild',
            createdAt: new Date().toISOString(),
          } as PriceSnapshot;
        })
        .filter((item): item is PriceSnapshot => item != null);
    })
  );

  return {
    report,
    rebuiltSnapshots,
    rebuiltPriceSnapshots,
  };
}
