import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const msg = `[Supabase] Missing env: url=${url ? 'set' : 'UNDEFINED'} key=${key ? 'set' : 'UNDEFINED'}. Check Vercel Project Settings → Environment Variables for NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.`;
    console.error(msg);
    if (typeof window !== 'undefined') {
      // 在浏览器上立即可见
      window.alert(msg);
    }
    throw new Error(msg);
  }

  return createBrowserClient(url, key);
};
