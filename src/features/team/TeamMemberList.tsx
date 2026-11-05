import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pencil, UserMinus } from "lucide-react";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { EditMemberSheet } from "@/features/team/EditMemberSheet";
import { RemoveMemberDialog } from "@/features/team/RemoveMemberDialog";
import { memberPageSize, teamMembersQueryOptions, type TeamMember } from "@/features/team/team-queries";
import { messages } from "@/lib/messages";

type MemberAction = { kind: "edit" | "remove"; member: TeamMember };

export function TeamMemberList({ organizationId, branches }: { organizationId: string; branches: WorkBranch[] }) {
  const [page, setPage] = useState(0);
  const [action, setAction] = useState<MemberAction | null>(null);
  const members = useQuery({ ...teamMembersQueryOptions(organizationId, page), placeholderData: keepPreviousData });
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));

  if (members.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label={messages.app.loading}>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }
  if (members.isError) return <QueryErrorState error={members.error} onRetry={() => void members.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {members.data.items.map((member) => (
          <li key={member.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-medium">{member.fullName ?? messages.team.unnamed}</span>
                <Badge variant="secondary" className="rounded-full">
                  {messages.roles[member.role]}
                </Badge>
              </span>
              <span className="text-sm text-muted-foreground">
                {member.role === "owner"
                  ? messages.team.allBranches
                  : member.branchIds.map((branchId) => branchNames.get(branchId)).filter(Boolean).join(", ")}
                {member.role === "staff" && member.canReviewDeposits ? ` · ${messages.team.reviewsDeposits}` : null}
              </span>
            </div>
            {member.role === "owner" ? null : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAction({ kind: "edit", member })}>
                  <Pencil aria-hidden />
                  {messages.team.edit}
                </Button>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setAction({ kind: "remove", member })}>
                  <UserMinus aria-hidden />
                  {messages.team.remove}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <PaginationControls page={page} pageSize={memberPageSize} totalCount={members.data.totalCount} onPageChange={setPage} />
      {action?.kind === "edit" && action.member.role !== "owner" ? (
        <EditMemberSheet
          organizationId={organizationId}
          member={action.member}
          role={action.member.role}
          branches={branches}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action?.kind === "remove" ? (
        <RemoveMemberDialog organizationId={organizationId} member={action.member} onClose={() => setAction(null)} />
      ) : null}
    </div>
  );
}
