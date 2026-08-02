import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshPricesByType } from '@/lib/priceApi';
import { getHkexSettlementRate } from '@/lib/hkexRateClient';
import { inferCurrencyFromSymbol } from '@/lib/fx';

export const dynamic = 'force-dynamic';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Missing Supabase server configuration' }, { status: 500 });

  const supabase = createClient(url, serviceKey);
  const { data: users, error: usersError } = await supabase.from('axia_data').select('user_id, data');
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const symbols = new Map<string, { symbol: string; assetType: 'stock' | 'fund'; currency: string }>();
  for (const row of users || []) {
    for (const position of (row.data?.positions || [])) {
      if (position.assetType !== 'stock' && position.assetType !== 'fund') continue;
      const symbol = String(position.symbol).toUpperCase();
      symbols.set(`${position.assetType}:${symbol}`, {
        symbol,
        assetType: position.assetType,
        currency: position.currency || inferCurrencyFromSymbol(symbol),
      });
    }
  }

  const items = [...symbols.values()];
  const prices = await refreshPricesByType(items.map((item) => item.symbol), items.map((item) => item.assetType));
  const date = today();
  const snapshots = (prices.prices || []).map((price) => {
    const item = items.find((candidate) => candidate.symbol === price.symbol.toUpperCase());
    return {
      symbol: price.symbol.toUpperCase(),
      asset_type: item?.assetType || 'stock',
      date,
      price: price.price,
      currency: item?.currency || inferCurrencyFromSymbol(price.symbol),
      source: price.source,
      data_tier: price.dataTier || null,
    };
  });

  if (snapshots.length > 0) {
    const { error } = await supabase.from('price_snapshots').upsert(snapshots, { onConflict: 'symbol,date' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hkex = await getHkexSettlementRate();
  if (hkex.rate.date) {
    const { error } = await supabase.from('hkex_rates').upsert({ date: hkex.rate.date, bid: hkex.rate.bid, ask: hkex.rate.ask }, { onConflict: 'date' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, date, trackedSymbols: items.length, savedSnapshots: snapshots.length, hkexSource: hkex.source, hkexDate: hkex.rate.date });
}
