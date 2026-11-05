import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CenteredPage } from "@/components/CenteredPage";
import { PageHeading } from "@/components/PageHeading";
import { readAccountSession } from "@/features/auth/auth-session";
import { CreateOrganizationForm } from "@/features/organization/CreateOrganizationForm";
import { storeOrganizationId } from "@/features/organization/current-workplace";
import { myBranchesQueryOptions, myMembershipsQueryOptions } from "@/features/organization/membership-queries";
import { messages } from "@/lib/messages";

// The owner's first organization and branch (app flow §10, steps 1 and 2).
export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context, location }) => {
    const session = await readAccountSession();
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    const memberships = await context.queryClient.fetchQuery(myMembershipsQueryOptions(session.user.id));
    if (memberships.length > 0) throw redirect({ to: "/shop" });
    return { userId: session.user.id };
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { queryClient, userId } = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <CenteredPage>
      <div className="flex flex-col gap-2">
        <PageHeading>{messages.onboarding.title}</PageHeading>
        <p className="text-muted-foreground">{messages.onboarding.intro}</p>
      </div>
      <CreateOrganizationForm
        onCreated={async ({ organizationId, branchId }) => {
          storeOrganizationId(organizationId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: myMembershipsQueryOptions(userId).queryKey }),
            queryClient.invalidateQueries({ queryKey: myBranchesQueryOptions(userId).queryKey }),
          ]);
          await navigate({ to: "/shop/$branchId/floor", params: { branchId } });
        }}
      />
    </CenteredPage>
  );
}
