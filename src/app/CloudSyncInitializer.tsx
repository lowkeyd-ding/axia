'use client';

import { useEffect, useState } from 'react';
import { useAppStore, clearSyncTimer } from '@/lib/store';

export function CloudSyncInitializer() {
  const [isReady, setIsReady] = useState(false);
  const { loadFromCloud, _hasLoadedFromCloud } = useAppStore();

  useEffect(() => {
    if (!_hasLoadedFromCloud) {
      loadFromCloud().finally(() => setIsReady(true));
    } else {
      setIsReady(true);
    }

    // 组件卸载时清理定时器，防止内存泄漏
    return () => {
      clearSyncTimer();
    };
  }, [_hasLoadedFromCloud, loadFromCloud]);

  return null;
}
