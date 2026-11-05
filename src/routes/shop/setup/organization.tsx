import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupPageLayout } from "@/components/SetupPageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { OrganizationProfileForm } from "@/features/organization/OrganizationProfileForm";
import { organizationSettingsQueryOptions } from "@/features/organization/organization-settings-queries";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/setup/organization")({
  component: OrganizationProfilePage,
});

function OrganizationProfilePage() {
  const { currentMembership, userId } = Route.useRouteContext();
  const settings = useQuery(organizationSettingsQueryOptions(currentMembership.organizationId));
  return (
    <SetupPageLayout title={messages.organizationProfile.title}>
      {settings.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : settings.isError ? (
        <QueryErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <OrganizationProfileForm settings={settings.data} userId={userId} />
      )}
    </SetupPageLayout>
  );
}
