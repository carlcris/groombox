import type { Membership, WorkBranch } from "@/features/organization/membership-queries";

// The organization and branch a member last worked in, remembered per browser.
const organizationStorageKey = "groombox.current-organization";
const branchStorageKey = "groombox.current-branch";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private windows); the first organization and branch are used instead.
  }
}

export function storeOrganizationId(organizationId: string): void {
  writeStored(organizationStorageKey, organizationId);
}

export function storeBranchId(branchId: string): void {
  writeStored(branchStorageKey, branchId);
}

export function pickCurrentMembership(memberships: Membership[]): Membership | undefined {
  const storedId = readStored(organizationStorageKey);
  return memberships.find((membership) => membership.organizationId === storedId) ?? memberships[0];
}

export function pickCurrentBranch(branches: WorkBranch[]): WorkBranch | undefined {
  const storedId = readStored(branchStorageKey);
  return branches.find((branch) => branch.id === storedId) ?? branches[0];
}
