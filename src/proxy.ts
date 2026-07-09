import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy（Next.js 16 已将 middleware 重命名为 proxy）
 *
 * 职责：
 *  1. 强制鉴权：未登录用户访问受保护路径 → /auth/login
 *  2. 刷新 Supabase session cookies
 *  3. 已登录用户访问登录/注册页 → /
 */

const AUTH_PAGES = new Set(['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password']);

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.has(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 构建初始响应，并在每个 cookie set 后克隆以保留它们
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 已登录 → 禁止再去登录/注册/忘记密码页
  if (user && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 未登录 → 受保护路径全部跳登录（首页 `/` 允许直接查看概览）
  const isProtected = pathname !== '/' && !isAuthPage(pathname) && !pathname.startsWith('/auth/callback');

  if (!user && isProtected) {
    const url = new URL('/auth/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
