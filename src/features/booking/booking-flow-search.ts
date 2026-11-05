import { z } from "zod";

// The booking flow keeps its choices in the URL, so they survive the guest or sign-in step, a
// reload, and the back button (CLAUDE.md, Multi-Service Bookings).
export const bookingSteps = ["services", "staff", "time", "details", "review"] as const;
export type BookingStep = (typeof bookingSteps)[number];

export const bookingFlowSearchSchema = z.object({
  services: z.string().optional().catch(undefined),
  staff: z.string().optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  time: z.string().optional().catch(undefined),
  step: z.enum(bookingSteps).optional().catch(undefined),
});

export type BookingFlowSearch = z.infer<typeof bookingFlowSearchSchema>;

// "any" in the URL, or a staff member's id.
export const anyStaff = "any";

export function readServiceIds(search: BookingFlowSearch): string[] {
  return search.services ? search.services.split(",").filter(Boolean) : [];
}

export function readStaffId(search: BookingFlowSearch): string | null {
  return search.staff && search.staff !== anyStaff ? search.staff : null;
}

// The step to show: the one asked for, unless an earlier choice is missing.
export function resolveStep(search: BookingFlowSearch): BookingStep {
  const requested = search.step ?? "services";
  const firstMissing: BookingStep | null =
    readServiceIds(search).length === 0 ? "services" : !search.staff ? "staff" : !search.date || !search.time ? "time" : null;
  if (firstMissing && bookingSteps.indexOf(requested) > bookingSteps.indexOf(firstMissing)) return firstMissing;
  return requested;
}

export function previousStep(step: BookingStep): BookingStep | null {
  const index = bookingSteps.indexOf(step);
  return index > 0 ? (bookingSteps[index - 1] ?? null) : null;
}
