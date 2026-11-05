import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { depositsQueryKey } from "@/features/deposits/deposit-queries";
import { supabase } from "@/lib/supabase-client";

// The deposit badge and list follow the branch's payment proofs and bookings live. Realtime sends
// only rows the reviewer may read; events trigger a refetch (TRD §9).
export function useDepositUpdates(branchId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!branchId) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: depositsQueryKey(branchId) });
    const channel = supabase
      .channel(`deposits:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs", filter: `branch_id=eq.${branchId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `branch_id=eq.${branchId}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, queryClient]);
}
