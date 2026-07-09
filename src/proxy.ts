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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.has(pathname);
}

/**
 * 带超时控制的 fetch，用于 edge runtime 中防止 Supabase edge call 卡死导致无限重定向。
 */
async function fetchWithTimeout(
  input: RequestInfo,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 3000, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...fetchInit, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 环境变量缺失时直接放行
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  });

  // getUser() 会调 Supabase edge endpoint，wrap with timeout + try-catch
  // 任何异常/超时不阻断放行，避免 edge runtime 异常时产生无限重定向
  let user = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    // Monkey-patch supabase fetch 以支持超时
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__supabaseOriginalFetch = originalFetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = (input: any, init?: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = originalFetch;
      return fetchWithTimeout(input, { ...init, timeoutMs: 3000 });
    };

    const { data } = await supabase.auth.getUser();
    user = data.user;

    clearTimeout(timer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
  } catch {
    // edge runtime 异常（超时 / fetch 失败 / Supabase edge redirect 等）→ 静默放行
  }

  // 已登录 → 禁止再去登录/注册页
  if (user && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 未登录 → 受保护路径跳登录（首页 `/` 允许直接查看概览）
  const isProtected =
    pathname !== '/' &&
    !isAuthPage(pathname) &&
    !pathname.startsWith('/auth/callback');

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
