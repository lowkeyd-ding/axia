'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import AuthCard, { FormError, inputClass, buttonClass } from '../AuthCard';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('密码至少 6 个字符');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // 密码更新成功，跳到首页
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <AuthCard
        title="设置新密码"
        subtitle="请输入您的新密码"
        footer={
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-medium">
            返回登录
          </Link>
        }
      >
        {!ready ? (
          <div className="text-center text-sm text-zinc-500 py-6">
            正在验证重置链接...
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <FormError message={error} />

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">新密码（至少 6 位）</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? '更新中...' : '更新密码'}
            </button>
          </form>
        )}
      </AuthCard>
    </div>
  );
}
