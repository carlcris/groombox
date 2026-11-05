import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import type { Json } from "@/types/database.types";

export const branchPaymentMethods = ["gcash", "maya", "bank_transfer", "other"] as const;
export type BranchPaymentMethod = (typeof branchPaymentMethods)[number];

// How clients pay the branch's deposits; snapshotted onto each booking when it is held.
export type BranchPaymentDetails = {
  method: BranchPaymentMethod;
  accountName: string;
  accountNumber: string;
  qrPath: string;
};

export type OwnedBranch = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  area: string;
  contactNumber: string;
  businessDayStart: string;
  timezone: string;
  paymentDetails: BranchPaymentDetails | null;
  isPublished: boolean;
};

const branchLimit = 100;

function readPaymentDetails(value: Json | null): BranchPaymentDetails | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { method, account_name: accountName, account_number: accountNumber, qr_path: qrPath } = value;
  if (
    typeof method !== "string" ||
    !(branchPaymentMethods as readonly string[]).includes(method) ||
    typeof accountName !== "string" ||
    typeof accountNumber !== "string" ||
    typeof qrPath !== "string"
  ) {
    return null;
  }
  return { method: method as BranchPaymentMethod, accountName, accountNumber, qrPath };
}

export function toPaymentInstructions(details: BranchPaymentDetails) {
  return {
    method: details.method,
    account_name: details.accountName,
    account_number: details.accountNumber,
    qr_path: details.qrPath,
  };
}

export function ownedBranchesQueryKey(organizationId: string) {
  return ["owned-branches", organizationId] as const;
}

export function ownedBranchesQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: ownedBranchesQueryKey(organizationId),
    queryFn: async (): Promise<OwnedBranch[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, slug, address, city, area, contact_number, business_day_start, timezone, payment_instructions, is_published")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name")
        .limit(branchLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        address: row.address ?? "",
        city: row.city ?? "",
        area: row.area ?? "",
        contactNumber: row.contact_number ?? "",
        businessDayStart: row.business_day_start.slice(0, 5),
        timezone: row.timezone,
        paymentDetails: readPaymentDetails(row.payment_instructions),
        isPublished: row.is_published,
      }));
    },
  });
}

// Hours and shifts at one branch, to check a new business day start against them.
export async function readBranchTimeRanges(branchId: string) {
  const [hours, shifts] = await Promise.all([
    supabase.from("branch_hours").select("opens_at, closes_at, closes_next_day, is_closed").eq("branch_id", branchId).limit(7),
    supabase.from("staff_shifts").select("starts_at, ends_at, ends_next_day").eq("branch_id", branchId).limit(500),
  ]);
  if (hours.error) throw hours.error;
  if (shifts.error) throw shifts.error;
  return [
    ...hours.data
      .filter((day) => !day.is_closed && day.opens_at && day.closes_at)
      .map((day) => ({ startsAt: (day.opens_at ?? "").slice(0, 5), endsAt: (day.closes_at ?? "").slice(0, 5), endsNextDay: day.closes_next_day })),
    ...shifts.data.map((shift) => ({ startsAt: shift.starts_at.slice(0, 5), endsAt: shift.ends_at.slice(0, 5), endsNextDay: shift.ends_next_day })),
  ];
}
