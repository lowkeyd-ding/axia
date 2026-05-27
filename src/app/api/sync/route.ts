import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const DATA_KEY = 'axia_data';

export async function GET() {
  try {
    const data = await kv.get(DATA_KEY);
    if (data) {
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    console.error('Failed to get data from KV:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await kv.set(DATA_KEY, body.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save data to KV:', error);
    return NextResponse.json({ success: false, error: 'Failed to save data' }, { status: 500 });
  }
}
