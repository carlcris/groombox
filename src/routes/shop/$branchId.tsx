import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { storeBranchId, storeOrganizationId } from "@/features/organization/current-workplace";

// A branch the member works in. Opening another organization's branch switches organization.
export const Route = createFileRoute("/shop/$branchId")({
  beforeLoad: ({ context, params, location }) => {
    const branch = context.workBranches.find((workBranch) => workBranch.id === params.branchId);
    if (!branch) throw redirect({ to: "/shop" });
    storeBranchId(branch.id);
    if (branch.organizationId !== context.currentMembership.organizationId) {
      storeOrganizationId(branch.organizationId);
      throw redirect({ href: location.href });
    }
    return { branch };
  },
  component: Outlet,
});
