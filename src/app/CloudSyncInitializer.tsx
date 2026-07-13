'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore, clearSyncTimer } from '@/lib/store';
import { useAuth } from '@/components/AuthProvider';

// 注：路由已迁出 /auth/* 以规避 Vercel 项目级 redirect 循环
const AUTH_PATHS = ['/signin', '/signup', '/forgot-password', '/reset-password', '/auth-callback', '/update-password'];

export function CloudSyncInitializer() {
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);
  const { user, isLoading: isAuthLoading } = useAuth();
  const { loadFromCloud, _hasLoadedFromCloud } = useAppStore();

  // Auth 页不触发云端同步，避免未登录时不必要的 API 调用
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  // 跟踪当前 user.id，使得登录/切换账号时重新拉取
  const [lastLoadedUserId, setLastLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthPage) {
      setIsReady(true);
      return;
    }

    // 必须等 Supabase 鉴权结束
    if (isAuthLoading) return;

    // 未登录：不拉取，但标记 ready 让 UI 显示
    if (!user) {
      setIsReady(true);
      return;
    }

    // 已登录，但还没为这个 user 加载过 → 加载
    if (lastLoadedUserId !== user.id) {
      loadFromCloud().finally(() => {
        setLastLoadedUserId(user.id);
        setIsReady(true);
      });
      return;
    }

    setIsReady(true);

    return () => {
      clearSyncTimer();
    };
  }, [isAuthPage, isAuthLoading, user, lastLoadedUserId, loadFromCloud]);

  return null;
}
