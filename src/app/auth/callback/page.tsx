'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();
      const next = searchParams.get('next') ?? '/';

      const { error } = await supabase.auth.getSession();

      if (error) {
        console.error('Auth callback error:', error);
        router.push(`/auth/login?error=${encodeURIComponent(error.message)}`);
      } else {
        router.push(next);
        router.refresh();
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-zinc-500">登录中...</p>
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
            <p className="text-sm text-zinc-500">登录中...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
