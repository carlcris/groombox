import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { messages } from "@/lib/messages";

// Phase 8 adds the owner's overdue statements and GroomBox's payment details to this notice.
export const Route = createFileRoute("/shop/restricted")({
  component: RestrictedNoticePage,
});

function RestrictedNoticePage() {
  const { currentMembership } = Route.useRouteContext();
  return (
    <div className="flex max-w-lg flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
      <Lock className="size-6 text-danger" aria-hidden />
      <PageHeading>{messages.shop.restrictedTitle}</PageHeading>
      <p className="text-muted-foreground">{currentMembership.organizationName}</p>
      <p>{currentMembership.role === "owner" ? messages.shop.restrictedOwner : messages.shop.restrictedMember}</p>
    </div>
  );
}
