import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupPageLayout } from "@/components/SetupPageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingPoliciesForm } from "@/features/organization/BookingPoliciesForm";
import { organizationSettingsQueryOptions } from "@/features/organization/organization-settings-queries";
import { TermsAcceptance } from "@/features/organization/TermsAcceptance";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/setup/policies")({
  component: BookingPoliciesPage,
});

function BookingPoliciesPage() {
  const { currentMembership } = Route.useRouteContext();
  const settings = useQuery(organizationSettingsQueryOptions(currentMembership.organizationId));
  return (
    <SetupPageLayout title={messages.policies.title}>
      {settings.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : settings.isError ? (
        <QueryErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <>
          <BookingPoliciesForm settings={settings.data} />
          <TermsAcceptance settings={settings.data} />
        </>
      )}
    </SetupPageLayout>
  );
}
