import { describe, it, expect } from 'vitest';
import { getBusinessDate, getBusinessMonth, getBusinessYear } from '@/lib/businessDate';

describe('businessDate', () => {
  it('uses Asia/Shanghai date for early UTC morning', () => {
    const date = new Date('2026-07-19T16:30:00.000Z'); // 2026-07-20 00:30 in Shanghai
    expect(getBusinessDate(date)).toBe('2026-07-20');
    expect(getBusinessMonth(date)).toBe('2026-07');
    expect(getBusinessYear(date)).toBe('2026');
  });

  it('handles month boundary in Shanghai correctly', () => {
    const date = new Date('2026-07-31T16:30:00.000Z'); // 2026-08-01 00:30 in Shanghai
    expect(getBusinessDate(date)).toBe('2026-08-01');
    expect(getBusinessMonth(date)).toBe('2026-08');
    expect(getBusinessYear(date)).toBe('2026');
  });

  it('handles year boundary in Shanghai correctly', () => {
    const date = new Date('2025-12-31T16:30:00.000Z'); // 2026-01-01 00:30 in Shanghai
    expect(getBusinessDate(date)).toBe('2026-01-01');
    expect(getBusinessMonth(date)).toBe('2026-01');
    expect(getBusinessYear(date)).toBe('2026');
  });
});
