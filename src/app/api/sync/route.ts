import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DATA_KEY = 'axia_data';

// 获取 Supabase 配置
function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !anonKey) {
    return null;
  }
  
  return { url, anonKey };
}

export async function GET() {
  const config = getSupabaseConfig();
  
  if (!config) {
    return NextResponse.json({ 
      success: false, 
      error: 'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.' 
    }, { status: 500 });
  }

  try {
    const supabase = createClient(config.url, config.anonKey);
    const { data, error } = await supabase
      .from('axia_data')
      .select('data')
      .eq('id', DATA_KEY)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error('Failed to get data:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const config = getSupabaseConfig();
  
  if (!config) {
    return NextResponse.json({ 
      success: false, 
      error: 'Supabase not configured' 
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    const supabase = createClient(config.url, config.anonKey);
    
    const record = {
      id: DATA_KEY,
      data: body.data,
      updated_at: new Date().toISOString(),
    };
    
    const { error } = await supabase.from('axia_data').upsert(record);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ success: false, error: 'Failed to save data' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save data:', error);
    return NextResponse.json({ success: false, error: 'Failed to save data' }, { status: 500 });
  }
}
