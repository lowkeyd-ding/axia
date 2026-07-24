import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPrice, refreshPricesByType } from '@/lib/priceApi';

describe('fund price refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes an OTC fund through the dedicated fund endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: [{
          symbol: '110022.OF',
          name: '易方达消费行业股票',
          price: 3.2456,
          change: 0.01,
          changePercent: 0.31,
          timestamp: '2026-07-24 15:00',
          source: 'fund',
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPrice('110022', 'fund');

    expect(fetchMock).toHaveBeenCalledWith('/api/fund-price?symbols=110022');
    expect(result).toMatchObject({ symbol: '110022', price: 3.2456, source: 'fund' });
  });

  it('keeps an exchange-traded fund code unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: [{
          symbol: '159915',
          price: 2.123,
          change: 0.01,
          changePercent: 0.47,
          timestamp: '2026-07-24T08:00:00.000Z',
          source: 'fund',
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshPricesByType(['159915'], ['fund']);

    expect(fetchMock).toHaveBeenCalledWith('/api/fund-price?symbols=159915');
  });

  it('sends a 11xxxx OTC fund unchanged to the fund endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prices: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshPricesByType(['110022'], ['fund']);

    expect(fetchMock).toHaveBeenCalledWith('/api/fund-price?symbols=110022');
  });
});
