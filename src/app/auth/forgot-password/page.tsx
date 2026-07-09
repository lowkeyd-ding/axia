'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import AuthCard, { FormError, inputClass, buttonClass } from '../AuthCard';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setInfo('重置链接已发送，请查收邮箱（包括垃圾邮件）。');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <AuthCard
        title="重置密码"
        subtitle="输入您的邮箱，我们将发送重置链接"
        footer={
          <>
            想起来了？{' '}
            <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-medium">
              返回登录
            </Link>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
          {info && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-3 py-2 rounded-lg">
              {info}
            </div>
          )}

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

          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? '发送中...' : '发送重置链接'}
          </button>
        </form>
      </AuthCard>
    </div>
  );
}
