'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/25">
              <span className="text-base">AX</span>
            </div>
            <span className="text-xl font-semibold text-zinc-900">AXIA</span>
          </Link>
          <p className="text-zinc-500 text-sm mt-3">重置密码</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          {success ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-zinc-600">
                  密码重置链接已发送到 <span className="font-medium text-zinc-900">{email}</span>
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  请查收邮件并点击链接重置密码
                </p>
              </div>
              <Link
                href="/auth/login"
                className="block w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl text-sm text-center transition-colors"
              >
                返回登录
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-600 mb-4">
                输入您的注册邮箱，我们将发送密码重置链接
              </p>

              <form onSubmit={handleReset} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    className="w-full px-3 py-2.5 border border-zinc-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium rounded-xl text-sm transition-colors"
                >
                  {loading ? '发送中...' : '发送重置链接'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-zinc-600 mt-4">
          想起密码了？{' '}
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-medium">
            返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}
