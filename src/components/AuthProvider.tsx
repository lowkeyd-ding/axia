'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import { syncToCloudForUser } from '@/lib/sync';

// 注：Vercel 在 /auth/* 路径下有项目级 redirect 循环，故改用 /signin、/signup 等前缀
const AUTH_PATHS = new Set([
  '/signin',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth-callback',
  '/update-password',
]);

/**
 * 受保护路径：需要登录后才能访问
 */
function isProtectedPath(pathname: string): boolean {
  if (pathname === '/') return false; // 首页允许未登录查看概览
  if (AUTH_PATHS.has(pathname)) return false;
  return true;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const resetAll = useAppStore((s) => s.resetAll);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 客户端鉴权：未登录访问受保护路径 → 跳登录
  useEffect(() => {
    if (isLoading) return;
    if (!user && isProtectedPath(pathname)) {
      const next = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/signin${next}`);
    }
    if (user && AUTH_PATHS.has(pathname)) {
      router.replace('/');
    }
  }, [isLoading, user, pathname, router]);

  // 加载中渲染占位，避免受保护页面一闪而过
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const signOut = async () => {
    const supabase = createClient();
    const currentUser = user;

    try {
      if (currentUser?.id) {
        const state = useAppStore.getState();
        await syncToCloudForUser(
          {
            accounts: state.accounts,
            positions: state.positions,
            snapshots: state.snapshots,
            trades: state.trades,
            transfers: state.transfers,
            targetAllocations: state.targetAllocations,
            lots: state.lots,
          },
          currentUser.id
        );
      }
    } catch {
      // 同步失败也不阻塞登出
    }

    await supabase.auth.signOut();
    resetAll();
    router.push('/signin');
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
