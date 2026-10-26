'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import AuthCard, { FormError, inputClass, buttonClass } from '@/components/AuthCard';

export default function RegisterPage() {
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
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = (await response.json()) as {
        hasSession?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error || '注册失败，请稍后重试');
        return;
      }

      // 关闭邮箱确认时，服务端会写入会话 Cookie，刷新后即可登录。
      if (result.hasSession) {
        try {
          await loadFromCloud();
        } catch {
          // 云同步失败不阻塞首次登录。
        }
        window.location.href = '/';
        return;
      }

      setInfo('注册成功！请前往邮箱点击确认链接以激活账户，然后回到登录页登录。');
    } catch {
      setError('无法连接注册服务，请检查网络后重试');
    } finally {
      setLoading(false);
    }
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
