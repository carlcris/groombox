import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { storeOrganizationId } from "@/features/organization/current-workplace";
import type { Membership, WorkBranch } from "@/features/organization/membership-queries";
import { messages } from "@/lib/messages";

// Lists every branch the member works in, grouped by organization (ACC-5). A restricted
// organization is listed by name and opens its notice.
export function BranchSwitcher({
  memberships,
  currentMembership,
  workBranches,
  activeBranchId,
}: {
  memberships: Membership[];
  currentMembership: Membership;
  workBranches: WorkBranch[];
  activeBranchId: string | undefined;
}) {
  const navigate = useNavigate();
  const activeBranch = workBranches.find((branch) => branch.id === activeBranchId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between" aria-label={messages.shop.switchBranch}>
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="truncate text-sm font-semibold">{currentMembership.organizationName}</span>
            {activeBranch ? <span className="truncate text-xs text-muted-foreground">{activeBranch.name}</span> : null}
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        {memberships.map((membership, index) => {
          const branches = workBranches.filter((branch) => branch.organizationId === membership.organizationId);
          return (
            <DropdownMenuGroup key={membership.organizationId}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{membership.organizationName}</DropdownMenuLabel>
              {membership.accessStatus === "restricted" ? (
                <DropdownMenuItem
                  className="min-h-11 text-base"
                  onSelect={() => {
                    storeOrganizationId(membership.organizationId);
                    void navigate({ to: "/shop/restricted" });
                  }}
                >
                  <Lock aria-hidden />
                  {messages.shop.restrictedTitle}
                </DropdownMenuItem>
              ) : (
                branches.map((branch) => (
                  <DropdownMenuItem
                    key={branch.id}
                    className="min-h-11 text-base"
                    onSelect={() => void navigate({ to: "/shop/$branchId/floor", params: { branchId: branch.id } })}
                  >
                    {branch.id === activeBranchId ? <Check aria-hidden /> : <span className="size-5" aria-hidden />}
                    {branch.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
