import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bookingByCodeQueryKey } from "@/features/booking/booking-link-queries";
import { supabase } from "@/lib/supabase-client";

// The booking page follows its booking live for the creator and the branch's members, whom the
// bookings policy lets Realtime send changes to. Events trigger a refetch (TRD §9).
export function useBookingUpdates(bookingId: string | null, bookingCode: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`booking:${bookingId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: bookingByCodeQueryKey(bookingCode) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingCode, bookingId, queryClient]);
}
