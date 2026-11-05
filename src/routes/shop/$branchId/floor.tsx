import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AddWalkInSheet } from "@/features/floor/AddWalkInSheet";
import { FloorQueue } from "@/features/floor/FloorQueue";
import { useVisitUpdates } from "@/features/floor/useVisitUpdates";
import { branchTodayQueryOptions, floorVisitsQueryOptions } from "@/features/floor/visit-queries";
import { branchSetupStatusQueryOptions } from "@/features/organization/branch-setup-status";
import { PublishingChecklist } from "@/features/organization/PublishingChecklist";
import { fillTemplate, messages } from "@/lib/messages";

// Today's queue at the branch, live on every device (FLR-1). Until a branch is published, its owner
// also sees the publishing checklist here (app flow §10).
export const Route = createFileRoute("/shop/$branchId/floor")({
  component: FloorPage,
});

function FloorPage() {
  const { branch, currentMembership } = Route.useRouteContext();
  const isOwner = currentMembership.role === "owner";
  const statuses = useQuery({ ...branchSetupStatusQueryOptions(branch.organizationId), enabled: isOwner });
  const status = statuses.data?.find((candidate) => candidate.branchId === branch.id);
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  useVisitUpdates(branch.id);
  const today = useQuery(branchTodayQueryOptions(branch.id));
  const visits = useQuery({ ...floorVisitsQueryOptions(branch.id, today.data ?? ""), enabled: today.isSuccess });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <PageHeading>{messages.shop.floorTitle}</PageHeading>
          <p className="text-muted-foreground">{branch.name}</p>
        </div>
        <Button onClick={() => setAddingWalkIn(true)}>
          <UserPlus aria-hidden />
          {messages.floor.addWalkIn}
        </Button>
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
      {today.isError ? (
        <QueryErrorState error={today.error} onRetry={() => void today.refetch()} />
      ) : visits.isError ? (
        <QueryErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : !visits.data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <FloorQueue branch={branch} visits={visits.data} />
      )}
      {addingWalkIn ? <AddWalkInSheet branchId={branch.id} onClose={() => setAddingWalkIn(false)} /> : null}
    </div>
  );
}
