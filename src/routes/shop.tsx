import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ShopShell } from "@/components/ShopShell";
import { readAccountSession } from "@/features/auth/auth-session";
import { pickCurrentMembership } from "@/features/organization/current-workplace";
import { myBranchesQueryOptions, myMembershipsQueryOptions } from "@/features/organization/membership-queries";

// The shop side, for members. A restricted organization sends every member to the notice.
export const Route = createFileRoute("/shop")({
  beforeLoad: async ({ context, location }) => {
    const session = await readAccountSession();
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    const userId = session.user.id;
    const memberships = await context.queryClient.fetchQuery(myMembershipsQueryOptions(userId));
    const currentMembership = pickCurrentMembership(memberships);
    if (!currentMembership) throw redirect({ to: "/onboarding" });

    const onRestrictedNotice = location.pathname === "/shop/restricted";
    if (currentMembership.accessStatus === "restricted" && !onRestrictedNotice) throw redirect({ to: "/shop/restricted" });
    if (currentMembership.accessStatus === "active" && onRestrictedNotice) throw redirect({ to: "/shop" });

    const workBranches = await context.queryClient.fetchQuery(myBranchesQueryOptions(userId));
    const branches = workBranches.filter((branch) => branch.organizationId === currentMembership.organizationId);
    return { userId, memberships, currentMembership, workBranches, branches };
  },
  component: ShopLayout,
});

function ShopLayout() {
  const { userId, memberships, currentMembership, workBranches } = Route.useRouteContext();
  return (
    <ShopShell
      userId={userId}
      memberships={memberships}
      currentMembership={currentMembership}
      workBranches={workBranches}
    >
      <Outlet />
    </ShopShell>
  );
}
