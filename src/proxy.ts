import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy（Next.js 16 已将 middleware 重命名为 proxy）
 *
 * 当前状态：临时禁用，由客户端 AuthProvider 处理鉴权。
 *
 * 原因：在 Vercel edge runtime 中调用 @supabase/ssr 的 getUser() 会触发
 * Supabase edge endpoint 调用，若 Supabase 项目 URL Configuration 配置不当
 * 或 edge 端点返回 redirect，会导致浏览器 ERR_TOO_MANY_REDIRECTS / HTTP 500。
 *
 * 待解决：检查 Supabase Dashboard → Authentication → URL Configuration，
 * 确认 Site URL 与 Redirect URLs 包含 https://axia-puce.vercel.app，
 * 然后恢复 getUser() 鉴权逻辑。
 */

export async function proxy(request: NextRequest) {
  // 暂不做任何鉴权跳转，直接放行
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
