import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge } from "@/features/booking/BookingStatusBadge";
import { nextVisitAction } from "@/features/floor/visit-actions";
import type { Visit } from "@/features/floor/visit-queries";
import { formatBusinessDayTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";

// Queue number or time, client, services, staff, status, and one next-step button (design brief §5).
export function QueueCard({
  branchId,
  visit,
  timeZone,
  isBusy,
  onNext,
  onDetails,
}: {
  branchId: string;
  visit: Visit;
  timeZone: string;
  isBusy: boolean;
  onNext: () => void;
  onDetails: () => void;
}) {
  const next = nextVisitAction(visit);
  const lead = visit.startAt
    ? formatBusinessDayTime(visit.startAt, timeZone, visit.businessDate)
    : visit.queueNumber
      ? fillTemplate(messages.floor.queueNumber, { number: String(visit.queueNumber) })
      : "";
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm" aria-label={visit.clientName}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-heading text-lg font-semibold tabular-nums">{lead}</span>
          <span className="text-lg font-medium">{visit.clientName}</span>
          <span className="text-sm text-muted-foreground">{visit.serviceNames.join(", ")}</span>
          <span className="text-sm">{visit.staffName ?? messages.floor.anyStaff}</span>
        </div>
        <BookingStatusBadge status={visit.status} />
      </div>
      <div className="flex gap-2">
        {next === "checkout" ? (
          <Button asChild className="flex-1">
            <Link to="/shop/$branchId/visit/$bookingId" params={{ branchId, bookingId: visit.id }}>
              {messages.visit.checkout}
            </Link>
          </Button>
        ) : next ? (
          <Button className="flex-1" disabled={isBusy} onClick={onNext}>
            {next === "check_in" ? messages.floor.checkIn : messages.floor.start}
          </Button>
        ) : null}
        <Button variant="outline" className={next ? "" : "flex-1"} onClick={onDetails}>
          {messages.floor.details}
        </Button>
      </div>
    </li>
  );
}
