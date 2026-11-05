import { queryOptions } from "@tanstack/react-query";
import type { MemberRole } from "@/features/organization/membership-queries";
import { supabase } from "@/lib/supabase-client";

export type InvitePreview = {
  organizationName: string;
  role: MemberRole;
  branchNames: string[];
  expiresAt: string;
};

// Readable before sign-in. No row means the invite is used, expired, or unknown.
export function invitePreviewQueryOptions(code: string) {
  return queryOptions({
    queryKey: ["invite-preview", code],
    queryFn: async (): Promise<InvitePreview | null> => {
      const { data, error } = await supabase.rpc("get_invite_preview", { p_code: code });
      if (error) throw error;
      const preview = data[0];
      if (!preview) return null;
      return {
        organizationName: preview.organization_name,
        role: preview.role,
        branchNames: preview.branch_names,
        expiresAt: preview.expires_at,
      };
    },
  });
}

export async function acceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) throw error;
  return data;
}
