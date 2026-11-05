import { Ban, CalendarCheck, CircleCheck, Clock, Hourglass, type LucideIcon, Scissors, TimerOff, TriangleAlert, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/features/booking/booking-link-queries";
import { cn } from "@/lib/class-names";
import { messages } from "@/lib/messages";

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

// Every booking state has a label, an icon, and a colour, in that order of reliance (design brief §1).
const statusAppearance: Record<BookingStatus, { icon: LucideIcon; tone: StatusTone }> = {
  held: { icon: Hourglass, tone: "warning" },
  payment_submitted: { icon: Clock, tone: "warning" },
  needs_resubmission: { icon: TriangleAlert, tone: "warning" },
  review_expired_pending_resolution: { icon: TriangleAlert, tone: "warning" },
  confirmed: { icon: CalendarCheck, tone: "success" },
  waiting: { icon: Clock, tone: "info" },
  checked_in: { icon: UserCheck, tone: "info" },
  in_service: { icon: Scissors, tone: "info" },
  completed: { icon: CircleCheck, tone: "success" },
  cancelled: { icon: Ban, tone: "danger" },
  no_show: { icon: Ban, tone: "neutral" },
  hold_expired: { icon: TimerOff, tone: "neutral" },
  payment_rejected: { icon: Ban, tone: "danger" },
};

const toneClasses: Record<StatusTone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
  neutral: "bg-neutral-surface text-neutral",
};

const stripeClasses: Record<StatusTone, string> = {
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
  info: "border-l-info",
  neutral: "border-l-neutral",
};

// A calendar block's colours for a status: its surface and the left edge stripe (design brief §5).
export function bookingStatusBlockClasses(status: BookingStatus): string {
  const { tone } = statusAppearance[status];
  return cn(toneClasses[tone], stripeClasses[tone]);
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { icon: Icon, tone } = statusAppearance[status];
  return (
    <Badge variant="secondary" className={cn("px-3 py-1 text-xs", toneClasses[tone])}>
      <Icon aria-hidden />
      {messages.bookingStatus[status]}
    </Badge>
  );
}
