import { queryOptions } from "@tanstack/react-query";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";
import { requireViewColumn } from "@/lib/view-columns";

// What each branch has towards publishing (SET-10). The setup screens own these rules.
export type BranchSetupStatus = {
  branchId: string;
  organizationId: string;
  isPublished: boolean;
  hasLocation: boolean;
  openDayCount: number;
  offeredServiceCount: number;
  bookableStaffWithShiftCount: number;
  hasPaymentDetails: boolean;
  termsAccepted: boolean;
};

export type ChecklistItem = { key: string; label: string; done: boolean };

const branchLimit = 100;

export function branchSetupStatusQueryKey(organizationId: string) {
  return ["branch-setup-status", organizationId] as const;
}

export function branchSetupStatusQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: branchSetupStatusQueryKey(organizationId),
    queryFn: async (): Promise<BranchSetupStatus[]> => {
      const { data, error } = await supabase
        .from("branch_setup_status")
        .select(
          "branch_id, organization_id, is_published, has_location, open_day_count, offered_service_count, bookable_staff_with_shift_count, has_payment_details, terms_accepted",
        )
        .eq("organization_id", organizationId)
        .limit(branchLimit);
      if (error) throw error;
      return data.map((row) => ({
        branchId: requireViewColumn(row.branch_id, "branch_id"),
        organizationId: requireViewColumn(row.organization_id, "organization_id"),
        isPublished: requireViewColumn(row.is_published, "is_published"),
        hasLocation: requireViewColumn(row.has_location, "has_location"),
        openDayCount: requireViewColumn(row.open_day_count, "open_day_count"),
        offeredServiceCount: requireViewColumn(row.offered_service_count, "offered_service_count"),
        bookableStaffWithShiftCount: requireViewColumn(row.bookable_staff_with_shift_count, "bookable_staff_with_shift_count"),
        hasPaymentDetails: requireViewColumn(row.has_payment_details, "has_payment_details"),
        termsAccepted: requireViewColumn(row.terms_accepted, "terms_accepted"),
      }));
    },
  });
}

export function publishingChecklist(status: BranchSetupStatus): ChecklistItem[] {
  return [
    { key: "location", label: messages.checklist.location, done: status.hasLocation },
    { key: "hours", label: messages.checklist.hours, done: status.openDayCount > 0 },
    { key: "services", label: messages.checklist.services, done: status.offeredServiceCount > 0 },
    { key: "staff", label: messages.checklist.staff, done: status.bookableStaffWithShiftCount > 0 },
    { key: "payment", label: messages.checklist.payment, done: status.hasPaymentDetails },
    { key: "terms", label: messages.checklist.terms, done: status.termsAccepted },
  ];
}

export function isReadyToPublish(status: BranchSetupStatus): boolean {
  return publishingChecklist(status).every((item) => item.done);
}
