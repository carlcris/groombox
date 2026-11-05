import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, UserRound } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { activeServicesQueryOptions } from "@/features/catalogue/catalogue-queries";
import { ownedBranchesQueryOptions } from "@/features/organization/branch-queries";
import { branchSetupStatusQueryOptions } from "@/features/organization/branch-setup-status";
import { StaffProfileSheet } from "@/features/staff/StaffProfileSheet";
import {
  linkableMembersQueryOptions,
  staffPageQueryOptions,
  staffPageSize,
  type StaffProfile,
} from "@/features/staff/staff-queries";
import { messages } from "@/lib/messages";
import { publicImageUrl } from "@/lib/stored-images";

export function StaffList({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<StaffProfile | "new" | null>(null);
  const staff = useQuery({ ...staffPageQueryOptions(organizationId, page), placeholderData: keepPreviousData });
  const branches = useQuery(ownedBranchesQueryOptions(organizationId));
  const services = useQuery(activeServicesQueryOptions(organizationId));
  const members = useQuery(linkableMembersQueryOptions(organizationId));
  const statuses = useQuery(branchSetupStatusQueryOptions(organizationId));

  if (staff.isPending || branches.isPending) return <Skeleton className="h-32 rounded-xl" />;
  if (staff.isError) return <QueryErrorState error={staff.error} onRetry={() => void staff.refetch()} />;
  if (branches.isError) return <QueryErrorState error={branches.error} onRetry={() => void branches.refetch()} />;

  const branchNames = new Map(branches.data.map((branch) => [branch.id, branch.name]));
  const addButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus aria-hidden />
      {messages.staff.addStaff}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {staff.data.totalCount === 0 ? (
        <EmptyState icon={UserRound} action={addButton}>
          {messages.staff.noStaff}
        </EmptyState>
      ) : (
        <>
          <div className="md:self-end">{addButton}</div>
          <ul className="flex flex-col gap-3">
            {staff.data.items.map((profile) => (
              <li key={profile.id} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                {profile.photoPath ? (
                  <img src={publicImageUrl("shop-media", profile.photoPath)} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted" aria-hidden>
                    <UserRound className="size-6 text-muted-foreground" />
                  </span>
                )}
                <div className="flex flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-medium">{profile.displayName}</span>
                    {!profile.isActive ? (
                      <Badge variant="secondary" className="rounded-full">{messages.staff.inactive}</Badge>
                    ) : !profile.isBookable ? (
                      <Badge variant="secondary" className="rounded-full">{messages.staff.notBookable}</Badge>
                    ) : null}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {[profile.title, profile.branchIds.map((branchId) => branchNames.get(branchId)).filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Button variant="outline" size="sm" aria-label={`${messages.setup.edit} ${profile.displayName}`} onClick={() => setEditing(profile)}>
                  <Pencil aria-hidden />
                  {messages.setup.edit}
                </Button>
              </li>
            ))}
          </ul>
          <PaginationControls page={page} pageSize={staffPageSize} totalCount={staff.data.totalCount} onPageChange={setPage} />
        </>
      )}
      {editing ? (
        <StaffProfileSheet
          organizationId={organizationId}
          staff={editing === "new" ? null : editing}
          branches={branches.data}
          services={services.data ?? []}
          members={members.data ?? []}
          statuses={statuses.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
