import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// The app holds only the Supabase URL and the public key (TRD §13).
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
