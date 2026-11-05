import { queryOptions } from "@tanstack/react-query";
import type { BookingStatus } from "@/features/booking/booking-link-queries";
import { supabase } from "@/lib/supabase-client";
import { requireViewColumn } from "@/lib/view-columns";
import type { Database } from "@/types/database.types";

export type BookingSource = Database["public"]["Enums"]["booking_source"];

// One visit on the floor or the calendar: a walk-in, an appointment, or an online booking.
export type Visit = {
  id: string;
  bookingCode: string;
  status: BookingStatus;
  source: BookingSource;
  businessDate: string;
  startAt: string | null;
  endAt: string | null;
  queueNumber: number | null;
  staffId: string | null;
  staffName: string | null;
  clientName: string;
  serviceIds: string[];
  serviceNames: string[];
  clientNote: string | null;
};

export type BranchServiceOption = { id: string; name: string; durationMinutes: number; price: number };

// A branch's day holds a few hundred visits at most, and a week a thousand; these bounds keep the
// reads finite.
const floorVisitLimit = 300;
const calendarVisitLimit = 1000;
const serviceOptionLimit = 200;

// Statuses that never appear on the floor or calendar: holds that ran out and rejected deposits
// released their slots.
const releasedStatuses = ["hold_expired", "payment_rejected"] as const satisfies readonly BookingStatus[];

export function visitsQueryKey(branchId: string) {
  return ["visits", branchId] as const;
}

type VisitRow = {
  id: string;
  booking_code: string;
  status: BookingStatus;
  source: BookingSource;
  business_date: string;
  start_at: string | null;
  end_at: string | null;
  queue_number: number | null;
  staff_id: string | null;
  hold_expires_at: string | null;
  client_note: string | null;
  staff: { display_name: string } | null;
  clients: { full_name: string } | null;
  booking_services: { service_id: string; service_name: string; sort_order: number }[];
};

function readVisits(rows: VisitRow[]): Visit[] {
  const now = Date.now();
  return rows
    .filter((row) => !(row.status === "held" && row.hold_expires_at !== null && new Date(row.hold_expires_at).getTime() <= now))
    .map((row) => {
      const services = [...row.booking_services].sort((first, second) => first.sort_order - second.sort_order);
      return {
        id: row.id,
        bookingCode: row.booking_code,
        status: row.status,
        source: row.source,
        businessDate: row.business_date,
        startAt: row.start_at,
        endAt: row.end_at,
        queueNumber: row.queue_number,
        staffId: row.staff_id,
        staffName: row.staff?.display_name ?? null,
        clientName: row.clients?.full_name ?? "",
        serviceIds: services.map((service) => service.service_id),
        serviceNames: services.map((service) => service.service_name),
        clientNote: row.client_note,
      };
    });
}

// The branch's current business date, from the shared function (the floor's "today").
export function branchTodayQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...visitsQueryKey(branchId), "today"] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.from("my_branches").select("current_business_date").eq("id", branchId).single();
      if (error) throw error;
      return requireViewColumn(data.current_business_date, "current_business_date");
    },
  });
}

// Every visit of one business date at the branch: the floor's queue.
export function floorVisitsQueryOptions(branchId: string, businessDate: string) {
  return queryOptions({
    queryKey: [...visitsQueryKey(branchId), "floor", businessDate] as const,
    queryFn: async (): Promise<Visit[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, booking_code, status, source, business_date, start_at, end_at, queue_number, staff_id, hold_expires_at, client_note, staff(display_name), clients(full_name), booking_services(service_id, service_name, sort_order)",
        )
        .eq("branch_id", branchId)
        .eq("business_date", businessDate)
        .not("status", "in", `(${releasedStatuses.join(",")})`)
        .order("start_at", { nullsFirst: true })
        .order("queue_number")
        .order("id")
        .limit(floorVisitLimit);
      if (error) throw error;
      return readVisits(data);
    },
  });
}

// Visits with a time range across a span of business dates: the calendar.
export function calendarVisitsQueryOptions(branchId: string, fromDate: string, toDate: string) {
  return queryOptions({
    queryKey: [...visitsQueryKey(branchId), "calendar", fromDate, toDate] as const,
    queryFn: async (): Promise<Visit[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, booking_code, status, source, business_date, start_at, end_at, queue_number, staff_id, hold_expires_at, client_note, staff(display_name), clients(full_name), booking_services(service_id, service_name, sort_order)",
        )
        .eq("branch_id", branchId)
        .gte("business_date", fromDate)
        .lte("business_date", toDate)
        .not("start_at", "is", null)
        .not("status", "in", `(${[...releasedStatuses, "cancelled"].join(",")})`)
        .order("start_at")
        .order("id")
        .limit(calendarVisitLimit);
      if (error) throw error;
      return readVisits(data);
    },
  });
}

// The active services a branch offers, at the branch's price, for the walk-in and appointment sheets.
export function branchServiceOptionsQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: ["branch-service-options", branchId] as const,
    queryFn: async (): Promise<BranchServiceOption[]> => {
      const { data, error } = await supabase
        .from("branch_services")
        .select("price_override, services(id, name, duration_minutes, price, is_active, sort_order)")
        .eq("branch_id", branchId)
        .limit(serviceOptionLimit);
      if (error) throw error;
      return data
        .flatMap((row) => (row.services && row.services.is_active ? [{ ...row.services, priceOverride: row.price_override }] : []))
        .sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name))
        .map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.duration_minutes,
          price: service.priceOverride ?? service.price,
        }));
    },
  });
}
