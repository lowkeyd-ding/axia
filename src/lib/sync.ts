const API_BASE = '/api/sync';

// 同步数据到云端
export async function syncToCloud(data: {
  accounts: any[];
  positions: any[];
  snapshots: any[];
  trades: any[];
  transfers: any[];
  targetAllocations: any[];
}): Promise<boolean> {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to sync to cloud:', error);
    return false;
  }
}

// 从云端加载数据
export async function loadFromCloud(): Promise<{
  accounts: any[];
  positions: any[];
  snapshots: any[];
  trades: any[];
  transfers: any[];
  targetAllocations: any[];
} | null> {
  try {
    const response = await fetch(API_BASE);
    if (response.ok) {
      const result = await response.json();
      if (result.data) {
        return result.data;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to load from cloud:', error);
    return null;
  }
}

// 检查是否应该使用云端存储
export function shouldUseCloudSync(): boolean {
  // 在浏览器环境中，且不是服务端渲染
  if (typeof window === 'undefined') return false;
  
  // 检查是否有 Vercel 环境变量（仅在服务端有效）
  // 客户端无法直接访问环境变量，我们通过检查 API 响应来判断
  return true;
}
