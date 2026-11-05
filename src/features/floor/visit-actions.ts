import type { Visit } from "@/features/floor/visit-queries";

export type VisitAction = "check_in" | "start" | "no_show" | "reschedule" | "cancel";

// What the shop can do with a visit in each status (app flow §5). Checkout is on the visit page.
export function availableVisitActions(visit: Visit): VisitAction[] {
  switch (visit.status) {
    case "confirmed":
      return ["check_in", "no_show", "reschedule", "cancel"];
    case "waiting":
    case "checked_in":
      return ["start", "cancel"];
    case "payment_submitted":
    case "needs_resubmission":
    case "review_expired_pending_resolution":
      return ["reschedule", "cancel"];
    case "held":
      return ["cancel"];
    default:
      return [];
  }
}

// The one next step a queue card offers: checkout opens the visit page.
export function nextVisitAction(visit: Visit): "check_in" | "start" | "checkout" | null {
  if (visit.status === "confirmed") return "check_in";
  if (visit.status === "waiting" || visit.status === "checked_in") return "start";
  if (visit.status === "in_service") return "checkout";
  return null;
}
