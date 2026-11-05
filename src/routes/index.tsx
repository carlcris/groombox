import { createFileRoute, redirect } from "@tanstack/react-router";
import { readAccountSession } from "@/features/auth/auth-session";
import { myMembershipsQueryOptions } from "@/features/organization/membership-queries";

// Members land on the shop side; a signed-in account with no organization sets one up. Clients
// get their own landing page with the client area (phase 7).
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await readAccountSession();
    if (!session) throw redirect({ to: "/sign-in" });
    const memberships = await context.queryClient.fetchQuery(myMembershipsQueryOptions(session.user.id));
    throw redirect({ to: memberships.length > 0 ? "/shop" : "/onboarding" });
  },
});
