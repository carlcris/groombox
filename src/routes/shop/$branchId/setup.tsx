import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeading } from "@/components/PageHeading";
import { BranchHoursSection } from "@/features/branch-setup/BranchHoursSection";
import { ClosuresSection } from "@/features/branch-setup/ClosuresSection";
import { OfferingsSection } from "@/features/branch-setup/OfferingsSection";
import { PhotosSection } from "@/features/branch-setup/PhotosSection";
import { ShiftsSection } from "@/features/branch-setup/ShiftsSection";
import { TimeOffSection } from "@/features/branch-setup/TimeOffSection";
import { branchSetupStatusQueryOptions } from "@/features/organization/branch-setup-status";
import { messages } from "@/lib/messages";

// Branch-level setup for the owner and the branch's managers (AGENTS.md, Roles).
export const Route = createFileRoute("/shop/$branchId/setup")({
  beforeLoad: ({ context, params }) => {
    if (context.currentMembership.role === "staff") {
      throw redirect({ to: "/shop/$branchId/floor", params: { branchId: params.branchId } });
    }
  },
  component: BranchSetupPage,
});

function BranchSetupPage() {
  const { branch } = Route.useRouteContext();
  const statuses = useQuery(branchSetupStatusQueryOptions(branch.organizationId));
  const status = statuses.data?.find((candidate) => candidate.branchId === branch.id);
  const isPublished = status?.isPublished ?? false;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading>{messages.branchSetup.title}</PageHeading>
        <p className="text-muted-foreground">{branch.name}</p>
      </div>
      <BranchHoursSection branch={branch} isPublished={isPublished} />
      <OfferingsSection branch={branch} isPublished={isPublished} offeredServiceCount={status?.offeredServiceCount ?? 0} />
      <ShiftsSection branch={branch} isPublished={isPublished} />
      <TimeOffSection branch={branch} />
      <ClosuresSection branch={branch} />
      <PhotosSection branch={branch} />
    </div>
  );
}
