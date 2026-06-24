'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';

export function CloudSyncInitializer() {
  const [isReady, setIsReady] = useState(false);
  const { loadFromCloud, _hasLoadedFromCloud } = useAppStore();

  useEffect(() => {
    if (!_hasLoadedFromCloud) {
      loadFromCloud().finally(() => setIsReady(true));
    } else {
      setIsReady(true);
    }
  }, []);

  return null;
}
