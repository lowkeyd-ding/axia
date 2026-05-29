import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 500 }
    );
  }

  // 只返回 URL 和 anon key（anon key 本身就是公开的）
  // 不返回 service_role key
  return NextResponse.json({
    url,
    anonKey,
  });
}
