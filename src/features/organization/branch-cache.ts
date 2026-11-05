import type { QueryClient } from "@tanstack/react-query";
import { branchSetupStatusQueryKey } from "@/features/organization/branch-setup-status";
import { ownedBranchesQueryKey } from "@/features/organization/branch-queries";

// Branch changes show in the branch list, the publishing status, and the branch switcher.
export function refreshBranchData(queryClient: QueryClient, organizationId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ownedBranchesQueryKey(organizationId) }),
    queryClient.invalidateQueries({ queryKey: branchSetupStatusQueryKey(organizationId) }),
    queryClient.invalidateQueries({ queryKey: ["my-branches"] }),
  ]);
}
