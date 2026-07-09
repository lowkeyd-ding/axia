'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadFromCloud = useAppStore((s) => s.loadFromCloud);

  useEffect(() => {
    let cancelled = false;

    const handle = async () => {
      const supabase = createClient();
      const next = searchParams.get('next') ?? '/';

      // PKCE / OAuth 流程：用 URL 上的 code 交换 session
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && !cancelled) {
          router.replace(`/auth/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
      }

      // 等待 session 真正建立
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error || !session) {
        router.replace(
          `/auth/login?error=${encodeURIComponent(error?.message ?? '登录失败，请重试')}`
        );
        return;
      }

      try {
        await loadFromCloud();
      } catch {
        // ignore
      }

      // Hard navigation 让 proxy 用新 cookie 重新跑
      window.location.href = next;
    };

    handle();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams, loadFromCloud]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-zinc-500">正在完成登录...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-sm text-zinc-500">正在完成登录...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
