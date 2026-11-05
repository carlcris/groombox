import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupPageLayout } from "@/components/SetupPageLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchCard } from "@/features/organization/BranchCard";
import { ownedBranchesQueryOptions } from "@/features/organization/branch-queries";
import { branchSetupStatusQueryOptions } from "@/features/organization/branch-setup-status";
import { CreateBranchSheet } from "@/features/organization/CreateBranchSheet";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/setup/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const { currentMembership } = Route.useRouteContext();
  const organizationId = currentMembership.organizationId;
  const [creating, setCreating] = useState(false);
  const branches = useQuery(ownedBranchesQueryOptions(organizationId));
  const statuses = useQuery(branchSetupStatusQueryOptions(organizationId));

  return (
    <SetupPageLayout title={messages.branches.title}>
      <Button className="md:self-end" onClick={() => setCreating(true)}>
        <Plus aria-hidden />
        {messages.branches.addBranch}
      </Button>
      {branches.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : branches.isError ? (
        <QueryErrorState error={branches.error} onRetry={() => void branches.refetch()} />
      ) : (
        <ul className="flex flex-col gap-4">
          {branches.data.map((branch) => (
            <BranchCard
              key={branch.id}
              organizationId={organizationId}
              branch={branch}
              status={statuses.data?.find((status) => status.branchId === branch.id)}
            />
          ))}
        </ul>
      )}
      <CreateBranchSheet organizationId={organizationId} open={creating} onOpenChange={setCreating} />
    </SetupPageLayout>
  );
}
