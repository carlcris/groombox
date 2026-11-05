import { useQuery } from "@tanstack/react-query";
import { CalendarX } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { availableSlotsQueryOptions, nextAvailableDateQueryOptions } from "@/features/booking/availability-queries";
import type { PublicBranch } from "@/features/booking/public-branch-queries";
import { cn } from "@/lib/class-names";
import {
  addDaysToBusinessDate,
  businessDateDayOfWeek,
  formatBusinessDate,
  formatBusinessDayTime,
} from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";

// The business dates clients may pick: today up to the booking horizon. Days the branch is closed
// every week are disabled; closures and full days show "No times left on this day".
function bookableDates(branch: PublicBranch) {
  return Array.from({ length: branch.bookingHorizonDays + 1 }, (_, offset) => {
    const date = addDaysToBusinessDate(branch.currentBusinessDate, offset);
    const hours = branch.hours.find((day) => day.dayOfWeek === businessDateDayOfWeek(date));
    return { date, isOpen: hours !== undefined && !hours.isClosed };
  });
}

// Step 3: a date, then one of its open start times (app flow §4).
export function TimeStep({
  branch,
  serviceIds,
  staffId,
  date,
  selectedTime,
  onDateChange,
  onTimeSelect,
}: {
  branch: PublicBranch;
  serviceIds: string[];
  staffId: string | null;
  date: string | undefined;
  selectedTime: string | undefined;
  onDateChange: (date: string) => void;
  onTimeSelect: (time: string, businessDate: string) => void;
}) {
  const dates = bookableDates(branch);
  const activeDate = date ?? dates.find((entry) => entry.isOpen)?.date ?? branch.currentBusinessDate;
  const slots = useQuery(availableSlotsQueryOptions(branch.id, activeDate, serviceIds, staffId));
  const nextDate = useQuery({
    ...nextAvailableDateQueryOptions(branch.id, activeDate, serviceIds, staffId),
    enabled: slots.isSuccess && slots.data.length === 0,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" role="group" aria-label={messages.booking.stepTime}>
        <ul className="flex w-max gap-2">
          {dates.map((entry) => (
            <li key={entry.date}>
              <button
                type="button"
                disabled={!entry.isOpen}
                aria-pressed={entry.date === activeDate}
                onClick={() => onDateChange(entry.date)}
                className={cn(
                  "flex h-16 w-20 flex-col items-center justify-center rounded-lg border bg-card text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
                  entry.date === activeDate && "border-primary bg-primary text-primary-foreground",
                )}
              >
                <span className="font-medium">
                  {entry.date === branch.currentBusinessDate ? messages.booking.today : formatBusinessDate(entry.date).split(",")[0]}
                </span>
                <span className="tabular-nums">{formatBusinessDate(entry.date).split(", ")[1]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="text-xl font-semibold">{formatBusinessDate(activeDate)}</h2>
      {slots.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : slots.isError ? (
        <QueryErrorState error={slots.error} onRetry={() => void slots.refetch()} />
      ) : slots.data.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          action={
            nextDate.data ? (
              <Button variant="outline" onClick={() => onDateChange(nextDate.data ?? activeDate)}>
                {fillTemplate(messages.booking.nextOpenDate, { date: formatBusinessDate(nextDate.data) })}
              </Button>
            ) : nextDate.isSuccess ? (
              <p className="text-sm text-muted-foreground">{messages.booking.noTimesInWindow}</p>
            ) : null
          }
        >
          {messages.booking.noTimesTitle}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-4">
          {slots.data.map((startAt) => (
            <li key={startAt}>
              <Button
                variant={startAt === selectedTime ? "default" : "outline"}
                aria-pressed={startAt === selectedTime}
                className="h-11 w-full tabular-nums"
                onClick={() => onTimeSelect(startAt, activeDate)}
              >
                {formatBusinessDayTime(startAt, branch.timezone, activeDate)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
