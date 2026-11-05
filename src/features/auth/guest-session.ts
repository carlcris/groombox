import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-client";

// The current session of any kind: an account, or a guest's anonymous session.
export async function readAnySession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Starts a guest's anonymous session. Supabase Auth checks the bot check token (Cloudflare
// Turnstile) and rate-limits anonymous sign-ins (TRD §14).
export async function startGuestSession(captchaToken: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
  if (error) throw error;
  if (!data.session) throw new Error("Anonymous sign-in returned no session.");
  return data.session;
}
