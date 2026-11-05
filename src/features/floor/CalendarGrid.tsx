import { bookingStatusBlockClasses } from "@/features/booking/BookingStatusBadge";
import { minutesIntoBusinessDate } from "@/features/floor/calendar-layout";
import type { Visit } from "@/features/floor/visit-queries";
import { cn } from "@/lib/class-names";
import { formatTime, formatTimeOfDay } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";

export type CalendarColumn = { key: string; label: string; visits: Visit[] };

// One minute of the day is one pixel high, so an hour is 60 pixels.
const pixelsPerMinute = 1;

function hourLabel(minute: number): string {
  const hour = Math.floor((minute % 1440) / 60);
  return formatTimeOfDay(`${String(hour).padStart(2, "0")}:00`);
}

// A time grid with one column per staff member or per day. Blocks are coloured by status with a
// left edge stripe and always carry the client name and time as text (design brief §5). Wide grids
// scroll inside their card on phones, never the page.
export function CalendarGrid({
  columns,
  startMinute,
  endMinute,
  timeZone,
  onSelect,
}: {
  columns: CalendarColumn[];
  startMinute: number;
  endMinute: number;
  timeZone: string;
  onSelect: (visit: Visit) => void;
}) {
  const height = (endMinute - startMinute) * pixelsPerMinute;
  const hours = Array.from({ length: (endMinute - startMinute) / 60 }, (_, index) => startMinute + index * 60);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <div className="flex min-w-full">
        <div className="sticky left-0 z-10 w-20 shrink-0 border-r bg-card">
          <div className="h-12 border-b" />
          <div className="relative" style={{ height }}>
            {hours.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 -translate-y-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                style={{ top: (minute - startMinute) * pixelsPerMinute }}
              >
                {hourLabel(minute)}
              </span>
            ))}
          </div>
        </div>
        {columns.map((column) => (
          <section key={column.key} aria-label={column.label} className="w-40 shrink-0 grow border-r last:border-r-0">
            <h3 className="flex h-12 items-center justify-center border-b px-2 text-center text-sm font-medium">{column.label}</h3>
            <div className="relative" style={{ height }}>
              {hours.map((minute) => (
                <div
                  key={minute}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-dashed"
                  style={{ top: (minute - startMinute) * pixelsPerMinute }}
                />
              ))}
              {column.visits.length === 0 ? <p className="sr-only">{messages.calendar.nothingBooked}</p> : null}
              {column.visits.map((visit) => {
                if (!visit.startAt || !visit.endAt) return null;
                const top = (minutesIntoBusinessDate(visit.startAt, timeZone, visit.businessDate) - startMinute) * pixelsPerMinute;
                const blockHeight = Math.max(
                  24,
                  (minutesIntoBusinessDate(visit.endAt, timeZone, visit.businessDate) -
                    minutesIntoBusinessDate(visit.startAt, timeZone, visit.businessDate)) *
                    pixelsPerMinute,
                );
                return (
                  <button
                    key={visit.id}
                    type="button"
                    onClick={() => onSelect(visit)}
                    className={cn(
                      "absolute inset-x-1 flex flex-col overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      bookingStatusBlockClasses(visit.status),
                    )}
                    style={{ top, height: blockHeight }}
                  >
                    <span className="truncate font-medium">{visit.clientName}</span>
                    <span className="truncate tabular-nums">
                      {formatTime(visit.startAt, timeZone)} · {visit.serviceNames.join(", ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
