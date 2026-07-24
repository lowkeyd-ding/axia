import { describe, it, expect } from 'vitest';
import {
  validateTargetAllocation,
  calculateAllocationDeviations,
  validateAllocationRows,
} from '@/lib/targetAllocation';
import type { TargetAllocation } from '@/types';

const sample: TargetAllocation = {
  id: '1',
  name: '稳健',
  allocations: [
    { category: 'stock', percentage: 40 },
    { category: 'fund', percentage: 30 },
    { category: 'cash', percentage: 20 },
    { category: 'bank_wealth_management', percentage: 10 },
  ],
  createdAt: '',
  updatedAt: '',
};

describe('validateTargetAllocation', () => {
  it('rejects out of range', () => {
    expect(
      validateTargetAllocation({ name: 'x', allocations: [{ category: 'stock', percentage: -1 }] })
    ).toBeTruthy();
    expect(
      validateTargetAllocation({ name: 'x', allocations: [{ category: 'stock', percentage: 101 }] })
    ).toBeTruthy();
    expect(
      validateTargetAllocation({ name: 'x', allocations: [{ category: 'stock', percentage: NaN }] })
    ).toBeTruthy();
  });

  it('rejects sum over 100', () => {
    expect(
      validateAllocationRows([
        { category: 'stock', percentage: 60 },
        { category: 'cash', percentage: 50 },
      ])
    ).toBeTruthy();
  });

  it('allows sum under 100 (unallocated reserved)', () => {
    expect(
      validateTargetAllocation({
        name: 'ok',
        allocations: [
          { category: 'stock', percentage: 40 },
          { category: 'cash', percentage: 20 },
        ],
      })
    ).toBeNull();
  });
});

describe('calculateAllocationDeviations', () => {
  it('sorts by absolute deviation', () => {
    const list = calculateAllocationDeviations(
      { stock: 60, fund: 30, cash: 10, bank_wealth_management: 0 },
      sample
    );
    expect(Math.abs(list[0].deviation)).toBeGreaterThanOrEqual(Math.abs(list[1].deviation));
  });

  it('handles missing categories as 0 current', () => {
    const list = calculateAllocationDeviations({ stock: 50 }, sample);
    const cash = list.find((x) => x.category === 'cash');
    expect(cash?.currentPercentage).toBe(0);
    expect(cash?.deviation).toBe(-20);
  });
});
