import { NextResponse } from 'next/server';
import { errorResponse, jsonResponse } from '@/lib/apiValidation';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return errorResponse('Supabase not configured', 500);
  }

  // 仅返回 URL 与匿名密钥（匿名密钥本身就是公开的）
  return jsonResponse({ url, anonKey });
}
