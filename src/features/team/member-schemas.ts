import { z } from "zod";
import { messages } from "@/lib/messages";

// Invites and member changes assign a manager or staff role; the owner role is never assigned.
export const assignableRoles = ["manager", "staff"] as const;
export type AssignableRole = (typeof assignableRoles)[number];

export const memberAssignmentSchema = z.object({
  role: z.enum(assignableRoles),
  branchIds: z.array(z.string()).min(1, { error: messages.validation.branchesRequired }),
  canReviewDeposits: z.boolean(),
});
