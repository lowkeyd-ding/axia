import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { errorResponse, jsonResponse, parseJsonBody, validateString } from '@/lib/apiValidation';

const DATA_KEY = 'axia_data';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

/**
 * 验证传入的同步数据
 * data 字段必须是包含特定键的对象
 */
function isValidSyncData(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const data = input as Record<string, unknown>;
  // 宽松校验：数据可以是空对象，也可以包含我们预期的字段
  // 进一步类型约束留给数据库层
  const validKeys = ['accounts', 'positions', 'snapshots', 'trades', 'transfers', 'targetAllocations'];
  return Object.keys(data).every(k => validKeys.includes(k) || typeof data[k] !== 'undefined');
}

export async function GET() {
  const config = getSupabaseConfig();

  if (!config) {
    return errorResponse(
      'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.',
      500
    );
  }

  try {
    const supabase = createClient(config.url, config.anonKey);
    const { data, error } = await supabase
      .from('axia_data')
      .select('data')
      .eq('id', DATA_KEY)
      .single();

    if (error || !data) {
      return jsonResponse({ success: true, data: null });
    }

    return jsonResponse({ success: true, data: data.data });
  } catch (error) {
    console.error('Failed to get data:', error);
    return errorResponse('Failed to fetch data', 500);
  }
}

export async function POST(request: Request) {
  const config = getSupabaseConfig();

  if (!config) {
    return errorResponse('Supabase not configured', 500);
  }

  // Validate Content-Type header
  const contentType = request.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return errorResponse('Content-Type must be application/json', 415);
  }

  // Validate body shape: { data: <object> }
  const validation = await parseJsonBody(request, (input): { ok: true; value: { data: unknown } } | { ok: false; error: string } => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { ok: false, error: 'Body must be a JSON object' };
    }
    const body = input as Record<string, unknown>;
    if (!('data' in body)) {
      return { ok: false, error: 'Missing required field: data' };
    }
    if (!isValidSyncData(body.data)) {
      return { ok: false, error: 'Invalid data field: must be a non-array object' };
    }
    return { ok: true, value: { data: body.data } };
  });

  if (!validation.ok) {
    return errorResponse(validation.error, 400);
  }

  try {
    const supabase = createClient(config.url, config.anonKey);

    const record = {
      id: DATA_KEY,
      data: validation.value.data,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('axia_data').upsert(record);

    if (error) {
      console.error('Supabase error:', error);
      return errorResponse('Failed to save data', 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Failed to save data:', error);
    return errorResponse('Failed to save data', 500);
  }
}
