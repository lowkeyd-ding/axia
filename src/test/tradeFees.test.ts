import { describe, it, expect } from 'vitest';
import { formatFeeDisplay, tradeCashWithFees, sumRecordedFees } from '@/lib/tradeFees';

describe('tradeFees', () => {
  it('formats missing fees as unrecorded', () => {
    expect(formatFeeDisplay({ fees: undefined }).label).toMatch(/未记录/);
  });

  it('formats zero fees carefully', () => {
    expect(formatFeeDisplay({ fees: 0 }).label).toMatch(/0/);
  });

  it('calculates buy and sell cash with fees consistently', () => {
    expect(tradeCashWithFees({ type: 'buy', quantity: 10, price: 10, total: 100, fees: 2 })).toBe(102);
    expect(tradeCashWithFees({ type: 'sell', quantity: 10, price: 10, total: 100, fees: 2 })).toBe(98);
  });

  it('sums only recorded fees', () => {
    const result = sumRecordedFees([{ fees: 1 }, { fees: 0 }, { fees: undefined } as never]);
    expect(result.total).toBe(1);
    expect(result.unrecordedCount).toBe(1);
  });
});
