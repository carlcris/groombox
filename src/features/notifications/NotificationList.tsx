import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  markNotificationRead,
  notificationListQueryOptions,
  notificationsQueryKey,
} from "@/features/notifications/notification-queries";
import { formatDateTime } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/class-names";

export function NotificationList({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const notifications = useInfiniteQuery(notificationListQueryOptions(userId));
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) }),
  });

  if (notifications.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label={messages.app.loading}>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }
  if (notifications.isError) {
    return <QueryErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />;
  }

  const items = notifications.data.pages.flat();
  if (items.length === 0) return <EmptyState icon={Bell}>{messages.notifications.empty}</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                "flex w-full flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors duration-150",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                item.readAt ? null : "border-primary bg-accent",
              )}
              onClick={() => {
                if (!item.readAt) markRead.mutate(item.id);
              }}
            >
              <span className="flex items-center gap-2 font-medium">
                {item.readAt ? null : (
                  <>
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    <span className="sr-only">{messages.notifications.unread}: </span>
                  </>
                )}
                {item.title}
              </span>
              {item.body ? <span className="text-muted-foreground">{item.body}</span> : null}
              <time dateTime={item.createdAt} className="text-xs font-medium text-muted-foreground">
                {formatDateTime(item.createdAt)}
              </time>
            </button>
          </li>
        ))}
      </ul>
      {notifications.hasNextPage ? (
        <Button
          variant="outline"
          disabled={notifications.isFetchingNextPage}
          onClick={() => void notifications.fetchNextPage()}
        >
          {messages.notifications.loadMore}
        </Button>
      ) : null}
    </div>
  );
}
