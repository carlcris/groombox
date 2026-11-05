import { createFileRoute } from "@tanstack/react-router";
import { SetupPageLayout } from "@/components/SetupPageLayout";
import { StaffList } from "@/features/staff/StaffList";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/setup/staff")({
  component: StaffPage,
});

function StaffPage() {
  const { currentMembership } = Route.useRouteContext();
  return (
    <SetupPageLayout title={messages.staff.title}>
      <StaffList organizationId={currentMembership.organizationId} />
    </SetupPageLayout>
  );
}
