import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsQueryKey } from "@/features/notifications/notification-queries";
import { supabase } from "@/lib/supabase-client";

// Realtime events trigger a refetch; they are not applied to the cache directly (TRD §9).
export function useNotificationUpdates(userId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${userId}` },
        () => void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
