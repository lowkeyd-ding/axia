'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('正在完成登录...');

  useEffect(() => {
    let cancelled = false;

    const handle = async () => {
      if (typeof window === 'undefined') return;

      const supabase = createClient();
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') ?? '/';

      // PKCE / OAuth 流程：用 URL 上的 code 交换 session
      const code = params.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && !cancelled) {
          setStatus('error');
          setMessage(error.message);
          setTimeout(() => {
            router.replace(`/auth/login?error=${encodeURIComponent(error.message)}`);
          }, 1500);
          return;
        }
      }

      // 等待 session 真正建立
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error || !session) {
        setStatus('error');
        setMessage(error?.message ?? '登录失败，请重试');
        setTimeout(() => {
          router.replace(
            `/auth/login?error=${encodeURIComponent(error?.message ?? '登录失败，请重试')}`
          );
        }, 1500);
        return;
      }

      // 跳转到目标页
      window.location.href = next;
    };

    handle();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-zinc-500">{message}</p>
        {status === 'error' && (
          <p className="text-xs text-zinc-400 mt-2">即将跳转到登录页...</p>
        )}
      </div>
    </div>
  );
}
