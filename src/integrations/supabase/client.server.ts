// Server-side Supabase client with service role key - bypasses RLS.
// SECURITY: Only use this for trusted server-side operations.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  const SUPABASE_URL =
    process.env.SUPABASE_URL ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ((import.meta.env as Record<string, string | undefined>).SUPABASE_SERVICE_ROLE_KEY);

  if (!SUPABASE_URL) {
    const message = 'Missing SUPABASE_URL or VITE_SUPABASE_URL env var. Please add it to your .env file.';
    console.error(`[RentWebify Server] ${message}`);
    throw new Error(message);
  }
  if (!SERVICE_ROLE_KEY) {
    const message = `Missing SUPABASE_SERVICE_ROLE_KEY env var. Please add it to your .env file for secure backend operations.`;
    console.error(`[RentWebify Server] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});