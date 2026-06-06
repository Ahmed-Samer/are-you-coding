// Browser-side Supabase client. Reads from Vite env at build time.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Vite strictly requires the literal string `import.meta.env.VITE_*` to perform static replacement.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL : undefined);

const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY : undefined);

import { getRootDomain } from '@/lib/branding';

function getCookieOptions() {
  const root = getRootDomain();
  const domain = root === 'localhost' ? 'localhost' : `.${root}`;
  // Using Secure in production
  const secure = root !== 'localhost' ? '; Secure' : '';
  return `path=/; domain=${domain}; max-age=31536000; SameSite=Lax${secure}`;
}

const cookieStorage = {
  getItem: (key: string): string | null => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^| )' + encodeURIComponent(key) + '=([^;]+)'));
    if (match) return decodeURIComponent(match[2]);
    return null;
  },
  setItem: (key: string, value: string): void => {
    if (typeof document === 'undefined') return;
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; ${getCookieOptions()}`;
  },
  removeItem: (key: string): void => {
    if (typeof document === 'undefined') return;
    const root = getRootDomain();
    const domain = root === 'localhost' ? 'localhost' : `.${root}`;
    document.cookie = `${encodeURIComponent(key)}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
};

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      '[RentWebify Client] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in your environment (.env).',
    );
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? cookieStorage : undefined,
      storageKey: 'rentwebify-auth-token',
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});