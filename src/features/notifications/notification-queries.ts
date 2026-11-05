import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";

export const notificationPageSize = 20;

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export function notificationsQueryKey(userId: string) {
  return ["notifications", userId] as const;
}

export function notificationListQueryOptions(userId: string) {
  return infiniteQueryOptions({
    queryKey: [...notificationsQueryKey(userId), "list"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<NotificationItem[]> => {
      const from = pageParam * notificationPageSize;
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + notificationPageSize - 1);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));
    },
    getNextPageParam: (lastPage, pages) => (lastPage.length === notificationPageSize ? pages.length : undefined),
  });
}

export function unreadNotificationCountQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...notificationsQueryKey(userId), "unread-count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// Marking a notification read is a direct single-row write that is not logged (AGENTS.md).
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  if (error) throw error;
}
