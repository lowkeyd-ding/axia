/**
 * SZSE 港股通结算汇兑比率 API
 *
 * GET  : 读取最新结算汇率
 * POST : 更新结算汇率（由浏览器自动化工具调用）
 *
 * 数据来源：深交所 https://www.szse.cn/szhk/hkbussiness/exchangerate/index.html
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HkexSettlementRates } from '@/lib/fx';

const TABLE = 'hkex_rates';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/hkex-rate
 * 读取最近一条港股通结算汇率
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({
        rate: { date: '', bid: 0.8649, ask: 0.8649 },
        source: 'default',
        note: 'SUPABASE_SERVICE_ROLE_KEY 未配置',
      });
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select('date, bid, ask')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned — not a real error
      console.error('[hkex-rate] Supabase read error:', error);
    }

    if (data) {
      return NextResponse.json({
        rate: {
          date: data.date,
          bid: data.bid,
          ask: data.ask,
        } as HkexSettlementRates,
        source: 'supabase',
      });
    }

    // No data in DB — return default (昨收 ~0.8649)
    return NextResponse.json({
      rate: {
        date: '',
        bid: 0.8649,
        ask: 0.8649,
      } as HkexSettlementRates,
      source: 'default',
      note: '无数据，请通过浏览器工具刷新汇率',
    });
  } catch (err) {
    console.error('[hkex-rate] GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/hkex-rate
 * 更新港股通结算汇率
 * Body: { date: string, bid: number, ask: number }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 未配置' }, { status: 500 });
    }

    const body = await req.json();
    const { date, bid, ask } = body as {
      date: string;
      bid: number;
      ask: number;
    };

    if (!date || typeof bid !== 'number' || typeof ask !== 'number') {
      return NextResponse.json(
        { error: 'Invalid body: { date, bid, ask } required' },
        { status: 400 }
      );
    }

    // Upsert: replace today's row (unique on date)
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { date, bid, ask },
        { onConflict: 'date' }
      );

    if (error) {
      console.error('[hkex-rate] Supabase upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      rate: { date, bid, ask },
      message: `已更新 ${date} 港股通结算汇率`,
    });
  } catch (err) {
    console.error('[hkex-rate] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
