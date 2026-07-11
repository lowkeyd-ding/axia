'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import AuthCard, { FormError, inputClass, buttonClass } from '@/components/AuthCard';

export default function RegisterPage() {
  const supabase = createClient();
  const loadFromCloud = useAppStore((s) => s.loadFromCloud);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 个字符');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // 即便后端开启了"邮箱确认"，也回跳到我们的 callback
        // Supabase 关闭确认时，signUp 后立即返回 session
        emailRedirectTo: `${window.location.origin}/auth-callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // 立即有 session → 直接登录
    if (data.session) {
      try {
        await loadFromCloud();
      } catch {
        // ignore
      }
      window.location.href = '/';
      return;
    }

    // 后端开启了"邮箱确认"
    setInfo('注册成功！请前往邮箱点击确认链接以激活账户，然后回到登录页登录。');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <AuthCard
        title="创建新账户"
        footer={
          <>
            已有账户？{' '}
            <Link href="/signin" className="text-blue-600 hover:text-blue-700 font-medium">
              登录
            </Link>
          </>
        }
      >
        <form onSubmit={handleRegister} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">密码（至少 6 位）</label>
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
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
      </AuthCard>
    </div>
  );
}
