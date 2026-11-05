import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { Button } from "@/components/ui/button";
import { branchSetupStatusQueryOptions } from "@/features/organization/branch-setup-status";
import { PublishingChecklist } from "@/features/organization/PublishingChecklist";
import { fillTemplate, messages } from "@/lib/messages";

// The floor view's queue arrives in phase 5. Until a branch is published, its owner sees the
// publishing checklist here (app flow §10).
export const Route = createFileRoute("/shop/$branchId/floor")({
  component: FloorPage,
});

function FloorPage() {
  const { branch, currentMembership } = Route.useRouteContext();
  const isOwner = currentMembership.role === "owner";
  const statuses = useQuery({ ...branchSetupStatusQueryOptions(branch.organizationId), enabled: isOwner });
  const status = statuses.data?.find((candidate) => candidate.branchId === branch.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading>{messages.shop.floorTitle}</PageHeading>
        <p className="text-muted-foreground">{branch.name}</p>
      </div>
      {isOwner && status && !status.isPublished ? (
        <section aria-labelledby="checklist-heading" className="flex max-w-xl flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm md:p-6">
          <h2 id="checklist-heading" className="text-xl font-semibold">
            {fillTemplate(messages.checklist.floorTitle, { branch: branch.name })}
          </h2>
          <PublishingChecklist status={status} />
          <Button asChild className="md:self-start">
            <Link to="/shop/setup/branches">{messages.checklist.goToBranches}</Link>
          </Button>
        </section>
      ) : null}
      <EmptyState icon={CalendarClock}>{messages.shop.floorEmpty}</EmptyState>
    </div>
  );
}
