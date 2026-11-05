import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { invitePageSize, inviteLink, openInvitesQueryOptions } from "@/features/team/team-queries";
import { formatDate } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";

export function OpenInviteList({ organizationId, branches }: { organizationId: string; branches: WorkBranch[] }) {
  const [page, setPage] = useState(0);
  const invites = useQuery({ ...openInvitesQueryOptions(organizationId, page), placeholderData: keepPreviousData });
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));

  if (invites.isPending) return <Skeleton className="h-20 rounded-xl" aria-busy="true" aria-label={messages.app.loading} />;
  if (invites.isError) return <QueryErrorState error={invites.error} onRetry={() => void invites.refetch()} />;
  if (invites.data.totalCount === 0) return <EmptyState icon={Link2}>{messages.team.noInvites}</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {invites.data.items.map((invite) => (
          <li key={invite.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {messages.roles[invite.role]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {invite.branchIds.map((branchId) => branchNames.get(branchId)).filter(Boolean).join(", ")}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {messages.team.expires} {formatDate(invite.expiresAt)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(inviteLink(invite.code)).then(() => toast.success(messages.team.linkCopied));
              }}
            >
              <Copy aria-hidden />
              {messages.team.copyLink}
            </Button>
          </li>
        ))}
      </ul>
      <PaginationControls page={page} pageSize={invitePageSize} totalCount={invites.data.totalCount} onPageChange={setPage} />
    </div>
  );
}
