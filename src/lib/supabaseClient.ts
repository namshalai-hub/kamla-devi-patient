import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  const url = supabaseUrl.trim();
  const key = supabaseAnonKey.trim();
  return !!(
    url && 
    key && 
    url !== '' && 
    key !== '' &&
    !url.includes('PASTE_YOUR_SUPABASE_URL_HERE') &&
    !key.includes('PASTE_YOUR_SUPABASE_ANON_KEY_HERE')
  );
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
