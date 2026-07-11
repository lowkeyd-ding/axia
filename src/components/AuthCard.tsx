'use client';

import Link from 'next/link';

/**
 * Auth 页面共用的卡片壳：标题、可选副标题、模式切换链接。
 * 让每个页面只关心业务表单，重复的 UI 收敛到一处。
 */
export default function AuthCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/25">
            <span className="text-base">AX</span>
          </div>
          <span className="text-xl font-semibold text-zinc-900">AXIA</span>
        </Link>
        <p className="text-zinc-500 text-sm mt-3">{title}</p>
        {subtitle ? <p className="text-zinc-400 text-xs mt-1">{subtitle}</p> : null}
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">{children}</div>

      {footer ? <div className="text-center text-sm text-zinc-600 mt-4">{footer}</div> : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
      {message}
    </div>
  );
}

export const inputClass =
  'w-full px-3 py-2.5 border border-zinc-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export const buttonClass =
  'w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium rounded-xl text-sm transition-colors';