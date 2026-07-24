import type { Trade } from '@/types';

/**
 * Fee transparency helpers — never invent commission/stamp tax splits.
 * Historical zeros without a filled fee are shown as unrecorded, not "true zero".
 */

export type FeeDisplay =
  | { kind: 'unrecorded'; label: string; amount: null }
  | { kind: 'recorded'; label: string; amount: number }
  | { kind: 'zero_explicit'; label: string; amount: 0 };

export function hasFeeField(trade: Pick<Trade, 'fees'> | { fees?: number | null }): boolean {
  return trade.fees !== undefined && trade.fees !== null && !Number.isNaN(trade.fees);
}

export function formatFeeDisplay(
  trade: Pick<Trade, 'fees'> | { fees?: number | null },
  options?: { treatMissingAsUnrecorded?: boolean }
): FeeDisplay {
  const treatMissing = options?.treatMissingAsUnrecorded !== false;
  if (!hasFeeField(trade)) {
    return { kind: 'unrecorded', label: '未记录', amount: null };
  }
  const fees = Number(trade.fees);
  if (!Number.isFinite(fees)) {
    return { kind: 'unrecorded', label: '未记录', amount: null };
  }
  if (fees === 0) {
    // Stored 0 may mean "explicitly zero" or legacy default — show carefully
    return {
      kind: treatMissing ? 'zero_explicit' : 'recorded',
      label: treatMissing ? '0（未填写）' : '0',
      amount: 0,
    };
  }
  return { kind: 'recorded', label: '已记录费用', amount: fees };
}

export function tradeNotional(trade: Pick<Trade, 'quantity' | 'price' | 'total'>): number {
  if (Number.isFinite(trade.total)) return trade.total;
  return (trade.quantity || 0) * (trade.price || 0);
}

/** Buy: cash out = notional + fees; Sell: cash in = notional - fees */
export function tradeCashWithFees(
  trade: Pick<Trade, 'type' | 'quantity' | 'price' | 'total' | 'fees'>
): number {
  const notional = tradeNotional(trade);
  const fees = hasFeeField(trade) && Number.isFinite(trade.fees) ? Number(trade.fees) : 0;
  if (trade.type === 'buy') return notional + fees;
  return notional - fees;
}

export function sumRecordedFees(trades: Array<Pick<Trade, 'fees'>>): {
  total: number;
  hasAnyRecorded: boolean;
  unrecordedCount: number;
} {
  let total = 0;
  let hasAnyRecorded = false;
  let unrecordedCount = 0;
  for (const t of trades) {
    const d = formatFeeDisplay(t);
    if (d.kind === 'unrecorded') unrecordedCount++;
    else if (d.amount != null && d.amount > 0) {
      total += d.amount;
      hasAnyRecorded = true;
    } else if (d.kind === 'zero_explicit') {
      hasAnyRecorded = true;
    }
  }
  return { total, hasAnyRecorded, unrecordedCount };
}

/**
 * Floating P&L on cost basis: market - cost.
 * Fees are NOT embedded in avgCost unless the app already rolled them into avgCost at trade time.
 * We only report recorded fees separately; do not invent tax lines.
 */
export function positionFeeSummary(
  trades: Array<Pick<Trade, 'fees' | 'type' | 'symbol' | 'accountId'>>,
  position: { symbol: string; accountId: string }
) {
  const related = trades.filter(
    (t) => t.symbol === position.symbol && t.accountId === position.accountId
  );
  return sumRecordedFees(related);
}
