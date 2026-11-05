import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { requireViewColumn } from "@/lib/view-columns";
import type { Database } from "@/types/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];
export type OrganizationAccessStatus = Database["public"]["Enums"]["org_access_status"];

export type Membership = {
  memberId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  accessStatus: OrganizationAccessStatus;
  role: MemberRole;
  canReviewDeposits: boolean;
};

export type WorkBranch = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  timezone: string;
  businessDayStart: string;
};

// A person belongs to a handful of organizations and an organization has a handful of branches;
// these bounds keep both reads finite.
const membershipLimit = 50;
const branchLimit = 100;

export function myMembershipsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["my-memberships", userId],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("my_memberships")
        .select("member_id, organization_id, organization_name, organization_slug, access_status, role, can_review_deposits")
        .order("organization_name")
        .limit(membershipLimit);
      if (error) throw error;
      return data.map((row) => ({
        memberId: requireViewColumn(row.member_id, "member_id"),
        organizationId: requireViewColumn(row.organization_id, "organization_id"),
        organizationName: requireViewColumn(row.organization_name, "organization_name"),
        organizationSlug: requireViewColumn(row.organization_slug, "organization_slug"),
        accessStatus: requireViewColumn(row.access_status, "access_status"),
        role: requireViewColumn(row.role, "role"),
        canReviewDeposits: requireViewColumn(row.can_review_deposits, "can_review_deposits"),
      }));
    },
  });
}

export function myBranchesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["my-branches", userId],
    queryFn: async (): Promise<WorkBranch[]> => {
      const { data, error } = await supabase
        .from("my_branches")
        .select("id, organization_id, name, slug, timezone, business_day_start")
        .order("name")
        .limit(branchLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: requireViewColumn(row.id, "id"),
        organizationId: requireViewColumn(row.organization_id, "organization_id"),
        name: requireViewColumn(row.name, "name"),
        slug: requireViewColumn(row.slug, "slug"),
        timezone: requireViewColumn(row.timezone, "timezone"),
        businessDayStart: requireViewColumn(row.business_day_start, "business_day_start").slice(0, 5),
      }));
    },
  });
}
