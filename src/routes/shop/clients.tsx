import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// The client list is for owners and managers (CLAUDE.md, Tenancy). Staff find clients through the
// walk-in and appointment sheets instead.
export const Route = createFileRoute("/shop/clients")({
  beforeLoad: ({ context }) => {
    if (context.currentMembership.role === "staff" || context.currentMembership.accessStatus !== "active") {
      throw redirect({ to: "/shop" });
    }
  },
  component: Outlet,
});
