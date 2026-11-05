import type { Membership } from "@/features/organization/membership-queries";

// Deposit reviewers: owners, managers, and staff the owner allowed to review deposits (CLAUDE.md,
// Tenancy). The database checks the same rule, with the branch.
export function canReviewDeposits(membership: Membership): boolean {
  return membership.role !== "staff" || membership.canReviewDeposits;
}
