import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-client";

// A signed-in account: members and owners. Guest (anonymous) sessions are not accounts.
export async function readAccountSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session && !data.session.user.is_anonymous ? data.session : null;
}

// Only same-origin paths are followed after sign-in.
export function safeRedirectPath(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}
