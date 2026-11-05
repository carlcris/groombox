import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { branchHoursQueryOptions, branchStaffQueryOptions } from "@/features/branch-setup/branch-setup-queries";
import { AppointmentSheet } from "@/features/floor/AppointmentSheet";
import { calendarHourRange, weekDates } from "@/features/floor/calendar-layout";
import { CalendarGrid, type CalendarColumn } from "@/features/floor/CalendarGrid";
import { StaffSelectField } from "@/features/floor/StaffSelectField";
import { useVisitUpdates } from "@/features/floor/useVisitUpdates";
import { branchTodayQueryOptions, calendarVisitsQueryOptions, type Visit } from "@/features/floor/visit-queries";
import { VisitSheet } from "@/features/floor/VisitSheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/class-names";
import { addDaysToBusinessDate, formatBusinessDate } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";

// The branch's calendar by day, with a column per staff member, and by week for one staff member on
// larger screens (FLR-4). Phones show one staff member at a time.
const calendarSearchSchema = z.object({
  view: z.enum(["day", "week"]).optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  staff: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/shop/$branchId/calendar")({
  validateSearch: calendarSearchSchema,
  component: CalendarPage,
});

function CalendarPage() {
  const { branch } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isTabletUp = useMediaQuery("(min-width: 768px)");
  const [openVisit, setOpenVisit] = useState<Visit | null>(null);
  const [addingAppointment, setAddingAppointment] = useState(false);
  useVisitUpdates(branch.id);

  const today = useQuery(branchTodayQueryOptions(branch.id));
  const staff = useQuery(branchStaffQueryOptions(branch.id));
  const hours = useQuery(branchHoursQueryOptions(branch.id));
  const date = search.date ?? today.data ?? "";
  const view = isTabletUp ? (search.view ?? "day") : "day";
  const dates = view === "week" && date ? weekDates(date) : [date];
  const visits = useQuery({
    ...calendarVisitsQueryOptions(branch.id, dates[0] ?? date, dates[dates.length - 1] ?? date),
    enabled: date !== "",
  });
  const selectedStaffId = search.staff ?? staff.data?.[0]?.id ?? null;
  const showsOneStaff = view === "week" || !isTabletUp;

  const setSearch = (changes: Partial<z.infer<typeof calendarSearchSchema>>) =>
    void navigate({ search: (previous) => ({ ...previous, ...changes }), replace: true });

  const error = today.error ?? staff.error ?? hours.error ?? visits.error;
  const ready = today.data && staff.data && hours.data && visits.data;

  let columns: CalendarColumn[] = [];
  if (ready) {
    const shown = visits.data.filter((visit) => !showsOneStaff || visit.staffId === selectedStaffId);
    columns =
      view === "week"
        ? dates.map((day) => ({ key: day, label: formatBusinessDate(day), visits: shown.filter((visit) => visit.businessDate === day) }))
        : (showsOneStaff ? staff.data.filter((member) => member.id === selectedStaffId) : staff.data).map((member) => ({
            key: member.id,
            label: member.displayName,
            visits: shown.filter((visit) => visit.staffId === member.id),
          }));
  }
  const range = ready
    ? calendarHourRange(
        dates,
        hours.data.map((day) => ({
          dayOfWeek: day.day_of_week,
          opensAt: day.opens_at,
          closesAt: day.closes_at,
          closesNextDay: day.closes_next_day,
          isClosed: day.is_closed,
        })),
        columns.flatMap((column) => column.visits),
        branch.timezone,
      )
    : null;
  const step = view === "week" ? 7 : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <PageHeading>{messages.calendar.title}</PageHeading>
          <p className="text-muted-foreground">{branch.name}</p>
        </div>
        <Button onClick={() => setAddingAppointment(true)} disabled={!date}>
          <CalendarPlus aria-hidden />
          {messages.floor.addAppointment}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label={messages.calendar.previous} onClick={() => setSearch({ date: addDaysToBusinessDate(date, -step) })}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="outline" onClick={() => setSearch({ date: today.data })}>
          {messages.calendar.today}
        </Button>
        <Button variant="outline" size="icon" aria-label={messages.calendar.next} onClick={() => setSearch({ date: addDaysToBusinessDate(date, step) })}>
          <ChevronRight aria-hidden />
        </Button>
        <h2 className="text-xl font-semibold tabular-nums">
          {date ? (view === "week" ? `${formatBusinessDate(dates[0] ?? date)} – ${formatBusinessDate(dates[6] ?? date)}` : formatBusinessDate(date)) : null}
        </h2>
        {isTabletUp ? (
          <div role="group" aria-label={messages.calendar.title} className="ml-auto flex gap-1 rounded-lg bg-muted p-1">
            {(["day", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setSearch({ view: option })}
                className={cn(
                  "min-h-11 rounded-md px-4 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === option && "bg-card text-foreground shadow-sm",
                )}
              >
                {option === "day" ? messages.calendar.day : messages.calendar.week}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showsOneStaff && staff.data && staff.data.length > 0 ? (
        <div className="max-w-xs">
          <StaffSelectField
            id="calendar-staff"
            label={messages.calendar.staff}
            staff={staff.data}
            value={selectedStaffId}
            onChange={(staffId) => setSearch({ staff: staffId ?? undefined })}
          />
        </div>
      ) : null}

      {error ? (
        <QueryErrorState error={error} onRetry={() => void Promise.all([today.refetch(), staff.refetch(), hours.refetch(), visits.refetch()])} />
      ) : !ready || !range ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : staff.data.length === 0 ? (
        <EmptyState icon={CalendarPlus}>{messages.calendar.noStaff}</EmptyState>
      ) : (
        <CalendarGrid
          columns={columns}
          startMinute={range.startMinute}
          endMinute={range.endMinute}
          timeZone={branch.timezone}
          onSelect={setOpenVisit}
        />
      )}

      {openVisit ? <VisitSheet branch={branch} visit={openVisit} initialMode="details" onClose={() => setOpenVisit(null)} /> : null}
      {addingAppointment ? <AppointmentSheet branch={branch} date={date} onClose={() => setAddingAppointment(false)} /> : null}
    </div>
  );
}
