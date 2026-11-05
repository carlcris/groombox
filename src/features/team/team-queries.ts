import { queryOptions } from "@tanstack/react-query";
import type { MemberRole } from "@/features/organization/membership-queries";
import { supabase } from "@/lib/supabase-client";

export const memberPageSize = 20;
export const invitePageSize = 10;

export type TeamMember = {
  id: string;
  fullName: string | null;
  role: MemberRole;
  canReviewDeposits: boolean;
  branchIds: string[];
};

export type OpenInvite = {
  id: string;
  code: string;
  role: MemberRole;
  branchIds: string[];
  expiresAt: string;
};

export type Page<Item> = { items: Item[]; totalCount: number };

export function teamQueryKey(organizationId: string) {
  return ["team", organizationId] as const;
}

export function teamMembersQueryOptions(organizationId: string, page: number) {
  return queryOptions({
    queryKey: [...teamQueryKey(organizationId), "members", page],
    queryFn: async (): Promise<Page<TeamMember>> => {
      const from = page * memberPageSize;
      const { data, error, count } = await supabase
        .from("organization_members")
        .select("id, role, can_review_deposits, profiles(full_name), member_branches(branch_id)", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("role")
        .order("created_at")
        .order("id")
        .range(from, from + memberPageSize - 1);
      if (error) throw error;
      return {
        totalCount: count ?? 0,
        items: data.map((row) => ({
          id: row.id,
          fullName: row.profiles?.full_name ?? null,
          role: row.role,
          canReviewDeposits: row.can_review_deposits,
          branchIds: row.member_branches.map((assignment) => assignment.branch_id),
        })),
      };
    },
  });
}

export function openInvitesQueryOptions(organizationId: string, page: number) {
  return queryOptions({
    queryKey: [...teamQueryKey(organizationId), "invites", page],
    queryFn: async (): Promise<Page<OpenInvite>> => {
      const from = page * invitePageSize;
      const { data, error, count } = await supabase
        .from("organization_invites")
        .select("id, code, role, branch_ids, expires_at", { count: "exact" })
        .eq("organization_id", organizationId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + invitePageSize - 1);
      if (error) throw error;
      return {
        totalCount: count ?? 0,
        items: data.map((row) => ({
          id: row.id,
          code: row.code,
          role: row.role,
          branchIds: row.branch_ids,
          expiresAt: row.expires_at,
        })),
      };
    },
  });
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}

export async function createInvite(input: { organizationId: string; role: MemberRole; branchIds: string[] }) {
  const { data, error } = await supabase.rpc("create_invite", {
    p_organization_id: input.organizationId,
    p_role: input.role,
    p_branch_ids: input.branchIds,
  });
  if (error) throw error;
  const invite = data[0];
  if (!invite) throw new Error("create_invite returned no row.");
  return { code: invite.code, expiresAt: invite.expires_at };
}

export async function updateMember(input: {
  memberId: string;
  role: MemberRole;
  branchIds: string[];
  canReviewDeposits: boolean;
}) {
  const { error } = await supabase.rpc("update_member", {
    p_member_id: input.memberId,
    p_role: input.role,
    p_branch_ids: input.branchIds,
    p_can_review_deposits: input.canReviewDeposits,
  });
  if (error) throw error;
}

export async function removeMember(memberId: string) {
  const { error } = await supabase.rpc("remove_member", { p_member_id: memberId });
  if (error) throw error;
}
