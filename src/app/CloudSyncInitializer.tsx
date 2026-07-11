'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore, clearSyncTimer } from '@/lib/store';

// 注：路由已迁出 /auth/* 以规避 Vercel 项目级 redirect 循环
const AUTH_PATHS = ['/signin', '/signup', '/forgot-password', '/reset-password', '/auth-callback', '/update-password'];

export function CloudSyncInitializer() {
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);
  const { loadFromCloud, _hasLoadedFromCloud } = useAppStore();

  // Auth 页不触发云端同步，避免未登录时不必要的 API 调用
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isAuthPage) {
      setIsReady(true);
      return;
    }

    if (!_hasLoadedFromCloud) {
      loadFromCloud().finally(() => setIsReady(true));
    } else {
      setIsReady(true);
    }

    return () => {
      clearSyncTimer();
    };
  }, [_hasLoadedFromCloud, loadFromCloud, isAuthPage]);

  return null;
}
