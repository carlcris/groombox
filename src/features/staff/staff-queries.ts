import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";

export const staffPageSize = 50;
// Bounds for the short pick lists: staff to link an invite to, and logins to link a profile to.
const pickListLimit = 200;

export type StaffProfile = {
  id: string;
  displayName: string;
  title: string | null;
  photoPath: string | null;
  commissionPercent: number;
  isBookable: boolean;
  isActive: boolean;
  memberId: string | null;
  branchIds: string[];
  services: { serviceId: string; commissionPercentOverride: number | null }[];
};

export type LinkableMember = { memberId: string; fullName: string | null; linkedStaffId: string | null };

export function staffQueryKey(organizationId: string) {
  return ["staff", organizationId] as const;
}

export function staffPageQueryOptions(organizationId: string, page: number) {
  return queryOptions({
    queryKey: [...staffQueryKey(organizationId), "page", page],
    queryFn: async (): Promise<{ items: StaffProfile[]; totalCount: number }> => {
      const from = page * staffPageSize;
      const { data, error, count } = await supabase
        .from("staff")
        .select(
          "id, display_name, title, photo_path, commission_percent, is_bookable, is_active, member_id, staff_branches(branch_id), staff_services(service_id, commission_percent_override)",
          { count: "exact" },
        )
        .eq("organization_id", organizationId)
        .order("is_active", { ascending: false })
        .order("display_name")
        .order("id")
        .range(from, from + staffPageSize - 1);
      if (error) throw error;
      return {
        totalCount: count ?? 0,
        items: data.map((row) => ({
          id: row.id,
          displayName: row.display_name,
          title: row.title,
          photoPath: row.photo_path,
          commissionPercent: row.commission_percent,
          isBookable: row.is_bookable,
          isActive: row.is_active,
          memberId: row.member_id,
          branchIds: row.staff_branches.map((assignment) => assignment.branch_id),
          services: row.staff_services.map((assignment) => ({
            serviceId: assignment.service_id,
            commissionPercentOverride: assignment.commission_percent_override,
          })),
        })),
      };
    },
  });
}

// Active staff profiles without a login, which an invite can link to.
export function unlinkedStaffQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...staffQueryKey(organizationId), "unlinked"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, display_name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .is("member_id", null)
        .order("display_name")
        .limit(pickListLimit);
      if (error) throw error;
      return data.map((row) => ({ id: row.id, displayName: row.display_name }));
    },
  });
}

// Active members other than the owner, with the staff profile each is linked to.
export function linkableMembersQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...staffQueryKey(organizationId), "linkable-members"],
    queryFn: async (): Promise<LinkableMember[]> => {
      const [members, links] = await Promise.all([
        supabase
          .from("organization_members")
          .select("id, profiles(full_name)")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .neq("role", "owner")
          .order("created_at")
          .limit(pickListLimit),
        supabase
          .from("staff")
          .select("id, member_id")
          .eq("organization_id", organizationId)
          .not("member_id", "is", null)
          .limit(pickListLimit),
      ]);
      if (members.error) throw members.error;
      if (links.error) throw links.error;
      const linkedStaff = new Map(links.data.map((link) => [link.member_id, link.id]));
      return members.data.map((member) => ({
        memberId: member.id,
        fullName: member.profiles?.full_name ?? null,
        linkedStaffId: linkedStaff.get(member.id) ?? null,
      }));
    },
  });
}

// Branches where a staff member has shifts, for the guard that keeps a published branch's last
// bookable staff member.
export async function readStaffShiftBranchIds(staffId: string): Promise<string[]> {
  const { data, error } = await supabase.from("staff_shifts").select("branch_id").eq("staff_id", staffId).limit(500);
  if (error) throw error;
  return [...new Set(data.map((row) => row.branch_id))];
}
