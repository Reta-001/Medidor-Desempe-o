import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 20
        }
      }
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Configuralas en Vercel y en client/.env para desarrollo local."
    );
  }

  return supabase;
}
