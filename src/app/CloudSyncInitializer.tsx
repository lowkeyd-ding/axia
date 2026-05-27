'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';

export function CloudSyncInitializer() {
  const [isLoading, setIsLoading] = useState(true);
  const { loadFromCloud, _hasLoadedFromCloud } = useAppStore();

  useEffect(() => {
    const init = async () => {
      // 如果还没有从云端加载过数据，则加载
      if (!_hasLoadedFromCloud) {
        await loadFromCloud();
      }
      setIsLoading(false);
    };
    init();
  }, []);

  // 不显示加载状态，避免闪烁
  return null;
}
