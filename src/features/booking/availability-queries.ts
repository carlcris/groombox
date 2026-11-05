import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";

// Availability and prices come from the database (AGENTS.md, Money Rules), which owns the slot
// rules; the screens never compute either.

export type BookingQuote = {
  serviceTotal: number;
  depositAmount: number;
  convenienceFee: number;
  amountDue: number;
};

// Times change as others book, so they are fetched fresh for each visit to the time step.
const availabilityStaleTime = 0;

export function availableSlotsQueryKey(branchId: string) {
  return ["available-slots", branchId] as const;
}

export function availableSlotsQueryOptions(branchId: string, businessDate: string, serviceIds: string[], staffId: string | null) {
  return queryOptions({
    queryKey: [...availableSlotsQueryKey(branchId), businessDate, serviceIds, staffId] as const,
    staleTime: availabilityStaleTime,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("get_available_slots", {
        p_branch_id: branchId,
        p_business_date: businessDate,
        p_service_ids: serviceIds,
        p_staff_id: staffId ?? undefined,
      });
      if (error) throw error;
      return data.map((slot) => slot.start_at);
    },
  });
}

export function nextAvailableDateQueryOptions(branchId: string, afterDate: string, serviceIds: string[], staffId: string | null) {
  return queryOptions({
    queryKey: [...availableSlotsQueryKey(branchId), "next-after", afterDate, serviceIds, staffId] as const,
    staleTime: availabilityStaleTime,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("get_next_available_date", {
        p_branch_id: branchId,
        p_after_date: afterDate,
        p_service_ids: serviceIds,
        p_staff_id: staffId ?? undefined,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function bookingQuoteQueryOptions(branchId: string, serviceIds: string[]) {
  return queryOptions({
    queryKey: ["booking-quote", branchId, serviceIds] as const,
    queryFn: async (): Promise<BookingQuote | null> => {
      const { data, error } = await supabase.rpc("get_booking_quote", { p_branch_id: branchId, p_service_ids: serviceIds });
      if (error) throw error;
      const quote = data[0];
      if (!quote) return null;
      return {
        serviceTotal: quote.service_total,
        depositAmount: quote.deposit_amount,
        convenienceFee: quote.convenience_fee,
        amountDue: quote.amount_due,
      };
    },
  });
}
