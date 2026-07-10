'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';

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

// 以 /auth/ 开头的页面都不做 redirect，避免误伤
function isAuthPath(pathname: string): boolean {
  return pathname.startsWith('/auth/');
}

function isProtectedPath(pathname: string): boolean {
  // 首页允许未登录查看；auth 路径不保护
  if (pathname === '/' || isAuthPath(pathname)) return false;
  // API 路由由服务端自己鉴权，不在客户端拦截
  if (pathname.startsWith('/api/')) return false;
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const resetAll = useAppStore((s) => s.resetAll);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 客户端鉴权：未登录访问受保护路径 → 跳登录
  useEffect(() => {
    if (isLoading) return;
    if (!user && isProtectedPath(pathname)) {
      const next = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/auth/login${next}`);
    }
  }, [isLoading, user, pathname, router]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetAll();
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
