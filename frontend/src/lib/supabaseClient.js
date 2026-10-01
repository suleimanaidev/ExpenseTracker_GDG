import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export const getSupabase = (url, anonKey) => {
  if (!supabaseInstance && url && anonKey && !url.includes('your_supabase_url')) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseInstance;
};
