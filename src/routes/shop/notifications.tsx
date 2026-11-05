import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/PageHeading";
import { NotificationList } from "@/features/notifications/NotificationList";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/notifications")({
  component: ShopNotificationsPage,
});

function ShopNotificationsPage() {
  const { userId } = Route.useRouteContext();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeading>{messages.notifications.title}</PageHeading>
      <NotificationList userId={userId} />
    </div>
  );
}
