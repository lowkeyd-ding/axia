import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware: 强制鉴权 + 同步刷新 Supabase session cookies。
 *
 * - 未登录用户访问受保护路径 → 重定向到 /auth/login
 * - 已登录用户访问 /auth/*（除 callback） → 重定向到 /
 */

const PUBLIC_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/update-password',
]);

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/update-password'];

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isCallback = pathname.startsWith('/auth/callback');

  // 已登录用户访问 /auth/login、/auth/register 等 → 跳到首页
  if (user && isAuthPath(pathname) && !isCallback) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 未登录用户访问受保护路径 → 跳到 /auth/login
  if (!user && !PUBLIC_PATHS.has(pathname) && !isCallback && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};