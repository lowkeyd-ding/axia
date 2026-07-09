'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import AuthCard, { FormError, inputClass, buttonClass } from '../AuthCard';

function LoginForm() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const loadFromCloud = useAppStore((s) => s.loadFromCloud);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextPath = searchParams.get('next') || '/';
  const urlError = searchParams.get('error');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    try {
      await loadFromCloud();
    } catch {
      // 即使拉取失败也不阻塞跳转
    }

    // Hard navigation 让 proxy 用新 cookie 重新跑
    window.location.href = nextPath;
  };

  return (
    <AuthCard
      title="登录您的账户"
      footer={
        <>
          还没有账户？{' '}
          <Link href="/auth/register" className="text-blue-600 hover:text-blue-700 font-medium">
            注册
          </Link>
        </>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <FormError message={error || urlError} />

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
            autoComplete="email"
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-zinc-700">密码</label>
            <Link href="/auth/forgot-password" className="text-xs text-blue-600 hover:text-blue-700">
              忘记密码？
            </Link>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            autoComplete="current-password"
            className={inputClass}
          />
        </div>

        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="w-full max-w-sm text-center text-sm text-zinc-500">加载中...</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
