import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Organization-wide setup is the owner's (AGENTS.md, Roles).
export const Route = createFileRoute("/shop/setup")({
  beforeLoad: ({ context }) => {
    if (context.currentMembership.role !== "owner") throw redirect({ to: "/shop" });
  },
  component: Outlet,
});
