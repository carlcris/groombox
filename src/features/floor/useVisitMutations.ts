import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { visitsQueryKey } from "@/features/floor/visit-queries";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

// The visit status moves, each one database function (AGENTS.md, Hard Constraints). A refusal
// because another device moved the visit first refreshes the lists.
export function useVisitMutations(branchId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: visitsQueryKey(branchId) });

  const checkIn = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("check_in_booking", { p_booking_id: bookingId });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.floor.checkedIn),
    onSettled: refresh,
  });
  const start = useMutation({
    mutationFn: async ({ bookingId, staffId }: { bookingId: string; staffId: string | null }) => {
      const { error } = await supabase.rpc("start_service", { p_booking_id: bookingId, p_staff_id: staffId ?? undefined });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.floor.started),
    onSettled: refresh,
  });
  const noShow = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("mark_no_show", { p_booking_id: bookingId });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.floor.markedNoShow),
    onSettled: refresh,
  });
  const reschedule = useMutation({
    mutationFn: async ({ bookingId, startAt, staffId }: { bookingId: string; startAt: string; staffId: string }) => {
      const { error } = await supabase.rpc("reschedule_booking", { p_booking_id: bookingId, p_start_at: startAt, p_staff_id: staffId });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.floor.rescheduled),
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string; reason: string }) => {
      const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: reason.trim() || undefined });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.floor.visitCancelled),
    onSettled: refresh,
  });
  return { checkIn, start, noShow, reschedule, cancel };
}
