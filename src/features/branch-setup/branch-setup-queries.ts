import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";

// One branch's setup is small: a week of hours, its staff, and their weekly shifts. These bounds
// keep each read finite; upcoming closures and time off are limited to the next entries.
const offeringLimit = 200;
const staffLimit = 100;
const shiftLimit = 500;
const upcomingLimit = 50;
const photoLimit = 20;

export type BranchStaffMember = { id: string; displayName: string; isBookable: boolean };
export type BranchShift = {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
};
export type DatedEntry = { id: string; startsAt: string; endsAt: string; reason: string | null };

export function branchSetupQueryKey(branchId: string) {
  return ["branch-setup", branchId] as const;
}

export function branchHoursQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_hours")
        .select("day_of_week, opens_at, closes_at, closes_next_day, is_closed")
        .eq("branch_id", branchId)
        .limit(7);
      if (error) throw error;
      return data;
    },
  });
}

export function upcomingClosuresQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "closures"],
    queryFn: async (): Promise<DatedEntry[]> => {
      const { data, error } = await supabase
        .from("branch_closures")
        .select("id, starts_at, ends_at, reason")
        .eq("branch_id", branchId)
        .gt("ends_at", new Date().toISOString())
        .order("starts_at")
        .limit(upcomingLimit);
      if (error) throw error;
      return data.map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason }));
    },
  });
}

export function branchPhotosQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_media")
        .select("id, storage_path, sort_order")
        .eq("branch_id", branchId)
        .order("sort_order")
        .limit(photoLimit);
      if (error) throw error;
      return data.map((row) => ({ id: row.id, storagePath: row.storage_path, sortOrder: row.sort_order }));
    },
  });
}

export function branchOfferingsQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "offerings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_services")
        .select("service_id, price_override")
        .eq("branch_id", branchId)
        .limit(offeringLimit);
      if (error) throw error;
      return new Map(data.map((row) => [row.service_id, row.price_override]));
    },
  });
}

// Active staff assigned to the branch.
export function branchStaffQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "staff"],
    queryFn: async (): Promise<BranchStaffMember[]> => {
      const { data, error } = await supabase
        .from("staff_branches")
        .select("staff(id, display_name, is_bookable, is_active)")
        .eq("branch_id", branchId)
        .limit(staffLimit);
      if (error) throw error;
      return data
        .flatMap((row) => (row.staff && row.staff.is_active ? [row.staff] : []))
        .map((staff) => ({ id: staff.id, displayName: staff.display_name, isBookable: staff.is_bookable }))
        .sort((first, second) => first.displayName.localeCompare(second.displayName));
    },
  });
}

export function branchShiftsQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "shifts"],
    queryFn: async (): Promise<BranchShift[]> => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("id, staff_id, day_of_week, starts_at, ends_at, ends_next_day")
        .eq("branch_id", branchId)
        .order("day_of_week")
        .order("starts_at")
        .limit(shiftLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        dayOfWeek: row.day_of_week,
        startsAt: row.starts_at.slice(0, 5),
        endsAt: row.ends_at.slice(0, 5),
        endsNextDay: row.ends_next_day,
      }));
    },
  });
}

export function upcomingTimeOffQueryOptions(branchId: string, staffIds: string[]) {
  return queryOptions({
    queryKey: [...branchSetupQueryKey(branchId), "time-off", staffIds],
    queryFn: async (): Promise<(DatedEntry & { staffId: string })[]> => {
      const { data, error } = await supabase
        .from("staff_time_off")
        .select("id, staff_id, starts_at, ends_at, reason")
        .in("staff_id", staffIds)
        .gt("ends_at", new Date().toISOString())
        .order("starts_at")
        .limit(upcomingLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        reason: row.reason,
      }));
    },
    enabled: staffIds.length > 0,
  });
}
