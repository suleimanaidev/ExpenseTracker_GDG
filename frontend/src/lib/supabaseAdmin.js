import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isServiceRoleConfigured = () => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(serviceRoleKey) &&
    !supabaseUrl.includes('your_supabase_url') &&
    !serviceRoleKey.includes('your_service_role_key')
  );
};

export const supabaseAdmin = createClient(
  supabaseUrl.includes('your_supabase_url') ? 'https://placeholder.supabase.co' : supabaseUrl,
  serviceRoleKey.includes('your_service_role_key') ? 'placeholder-key' : serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
