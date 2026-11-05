import { queryOptions } from "@tanstack/react-query";
import type { BookingStatus } from "@/features/booking/booking-link-queries";
import { supabase } from "@/lib/supabase-client";

export type ClientSummary = { id: string; fullName: string; mobileNumber: string | null; hasAccount: boolean };
export type ClientVisit = {
  id: string;
  branchId: string;
  status: BookingStatus;
  startAt: string | null;
  businessDate: string;
  branchName: string;
  branchTimezone: string;
  serviceNames: string[];
};

export const clientPageSize = 20;

export function clientsQueryKey(organizationId: string) {
  return ["clients", organizationId] as const;
}

// Characters that would break PostgREST's or= filter syntax are dropped from the search text.
function searchPattern(search: string): string {
  return `*${search.trim().replace(/[,()*\\]/g, " ")}*`;
}

// The organization's clients, searched and paged in the database, for owners and managers.
export function clientPageQueryOptions(organizationId: string, search: string, page: number) {
  return queryOptions({
    queryKey: [...clientsQueryKey(organizationId), "page", search, page] as const,
    queryFn: async (): Promise<{ clients: ClientSummary[]; totalCount: number }> => {
      const from = page * clientPageSize;
      let query = supabase
        .from("clients")
        .select("id, full_name, mobile_number, user_id", { count: "exact" })
        .eq("organization_id", organizationId);
      if (search.trim()) {
        const pattern = searchPattern(search);
        query = query.or(`full_name.ilike.${pattern},mobile_number.ilike.${pattern}`);
      }
      const { data, error, count } = await query.order("full_name").order("id").range(from, from + clientPageSize - 1);
      if (error) throw error;
      return {
        clients: data.map((row) => ({ id: row.id, fullName: row.full_name, mobileNumber: row.mobile_number, hasAccount: row.user_id !== null })),
        totalCount: count ?? 0,
      };
    },
  });
}

export function clientQueryOptions(organizationId: string, clientId: string) {
  return queryOptions({
    queryKey: [...clientsQueryKey(organizationId), "client", clientId] as const,
    queryFn: async (): Promise<ClientSummary | null> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, mobile_number, user_id")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, fullName: data.full_name, mobileNumber: data.mobile_number, hasAccount: data.user_id !== null } : null;
    },
  });
}

// The shop's private notes, which only owners and managers read (get_client_notes).
export function clientNotesQueryOptions(organizationId: string, clientId: string) {
  return queryOptions({
    queryKey: [...clientsQueryKey(organizationId), "notes", clientId] as const,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc("get_client_notes", { p_client_id: clientId });
      if (error) throw error;
      return data ?? "";
    },
  });
}

export function clientVisitsQueryOptions(organizationId: string, clientId: string, page: number) {
  return queryOptions({
    queryKey: [...clientsQueryKey(organizationId), "visits", clientId, page] as const,
    queryFn: async (): Promise<{ visits: ClientVisit[]; totalCount: number }> => {
      const from = page * clientPageSize;
      const { data, error, count } = await supabase
        .from("bookings")
        .select("id, branch_id, status, start_at, business_date, branches(name, timezone), booking_services(service_name, sort_order)", {
          count: "exact",
        })
        .eq("client_id", clientId)
        .order("business_date", { ascending: false })
        .order("start_at", { ascending: false, nullsFirst: false })
        .order("id")
        .range(from, from + clientPageSize - 1);
      if (error) throw error;
      return {
        visits: data.map((row) => ({
          id: row.id,
          branchId: row.branch_id,
          status: row.status,
          startAt: row.start_at,
          businessDate: row.business_date,
          branchName: row.branches?.name ?? "",
          branchTimezone: row.branches?.timezone ?? "Asia/Manila",
          serviceNames: [...row.booking_services].sort((first, second) => first.sort_order - second.sort_order).map((service) => service.service_name),
        })),
        totalCount: count ?? 0,
      };
    },
  });
}
