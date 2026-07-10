import { Suspense } from 'react';
import AuthCard from '../AuthCard';

/**
 * 简化版登录页面 — 用于排查 Vercel 部署 /auth/login 路径 500/timeout 问题。
 * 把原 client-side 鉴权全去掉，render 一个最简表单，确认 route 能 200。
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="w-full max-w-sm text-center text-sm text-zinc-500">
            加载中...
          </div>
        }
      >
        <AuthCard title="登录您的账户">
          <div className="text-center text-sm text-zinc-500">
            登录功能正在恢复中...
          </div>
        </AuthCard>
      </Suspense>
    </div>
  );
}
