import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { visitsQueryKey } from "@/features/floor/visit-queries";
import { supabase } from "@/lib/supabase-client";

// The floor and calendar follow the branch's bookings live, so two devices on one branch stay in
// step. Events trigger a refetch (TRD §9).
export function useVisitUpdates(branchId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`visits:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `branch_id=eq.${branchId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: visitsQueryKey(branchId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, queryClient]);
}
