import { createFileRoute, redirect } from "@tanstack/react-router";
import { pickCurrentBranch } from "@/features/organization/current-workplace";

export const Route = createFileRoute("/shop/")({
  beforeLoad: ({ context }) => {
    const branch = pickCurrentBranch(context.branches);
    if (branch) throw redirect({ to: "/shop/$branchId/floor", params: { branchId: branch.id } });
    if (context.currentMembership.role === "owner") throw redirect({ to: "/shop/team" });
    throw redirect({ to: "/shop/notifications" });
  },
});
