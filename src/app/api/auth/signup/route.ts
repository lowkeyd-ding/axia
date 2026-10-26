import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface SignupBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  let body: SignupBody;

  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: '密码至少 6 个字符' }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const origin = new URL(request.url).origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth-callback`,
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 400 },
      );
    }

    return NextResponse.json({ hasSession: Boolean(data.session) });
  } catch (error) {
    console.error('Signup service unavailable:', error);
    return NextResponse.json(
      { error: '注册服务暂时无法连接，请稍后重试' },
      { status: 503 },
    );
  }
}
