import { z } from "zod";
import { messages } from "@/lib/messages";

// A new branch starts its business day at 5:00 AM (backend schema, branches.business_day_start).
export const defaultBusinessDayStart = "05:00";

export type DayHours = {
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
  closesNextDay: boolean;
};

export type DayHoursProblems = { opensAt?: string; closesAt?: string };

export type TimeRange = { startsAt: string; endsAt: string; endsNextDay: boolean };
export type TimeRangeProblem = "starts_too_early" | "ends_too_late" | "ends_before_start";

// Hours belong to the day they open. They start at or after the business day start and, when they
// close after midnight, end by it, so one opening never spans two business dates. The screens own
// this check; the database does not repeat it. Shifts follow the same rule.
export function findTimeRangeProblems(
  range: TimeRange,
  businessDayStart: string,
): { startsAt?: TimeRangeProblem; endsAt?: TimeRangeProblem } {
  const start = businessDayStart.slice(0, 5);
  const problems: { startsAt?: TimeRangeProblem; endsAt?: TimeRangeProblem } = {};
  if (range.startsAt < start) problems.startsAt = "starts_too_early";
  if (range.endsNextDay && range.endsAt > start) problems.endsAt = "ends_too_late";
  if (!range.endsNextDay && range.endsAt <= range.startsAt) problems.endsAt = "ends_before_start";
  return problems;
}

export function fitsBusinessDay(range: TimeRange, businessDayStart: string): boolean {
  const problems = findTimeRangeProblems(range, businessDayStart);
  return !problems.startsAt && !problems.endsAt;
}

const hoursWording: Record<TimeRangeProblem, string> = {
  starts_too_early: messages.validation.opensFromBusinessDayStart,
  ends_too_late: messages.validation.closesByBusinessDayStart,
  ends_before_start: messages.validation.closesAfterOpens,
};

export function findDayHoursProblems(day: DayHours, businessDayStart: string): DayHoursProblems {
  if (day.isClosed) return {};
  if (!day.opensAt || !day.closesAt) return { closesAt: messages.validation.hoursRequired };
  const problems = findTimeRangeProblems(
    { startsAt: day.opensAt, endsAt: day.closesAt, endsNextDay: day.closesNextDay },
    businessDayStart,
  );
  return {
    opensAt: problems.startsAt ? hoursWording[problems.startsAt] : undefined,
    closesAt: problems.endsAt ? hoursWording[problems.endsAt] : undefined,
  };
}

const dayHoursShape = z.object({
  dayOfWeek: z.number(),
  isClosed: z.boolean(),
  opensAt: z.string(),
  closesAt: z.string(),
  closesNextDay: z.boolean(),
});

// The week editor shows each day's problems itself; the schema only blocks the submit.
export function weekHoursSchema(businessDayStart: string, options: { requireOpenDay: boolean }) {
  return z.array(dayHoursShape).superRefine((days, context) => {
    const hasProblem = days.some((day) => Object.values(findDayHoursProblems(day, businessDayStart)).some(Boolean));
    if (hasProblem) context.addIssue({ code: "custom", message: messages.validation.fixHours });
    if (options.requireOpenDay && !days.some((day) => !day.isClosed)) {
      context.addIssue({ code: "custom", message: messages.publishGuards.lastOpenDay });
    }
  });
}

// Monday first, as the week is read in the Philippines; day_of_week keeps Sunday as 0.
export const weekdayDisplayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export function defaultWeekHours(): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    isClosed: false,
    opensAt: "10:00",
    closesAt: "20:00",
    closesNextDay: false,
  }));
}

// Stored rows for a branch, as the editor's seven days; a missing day is closed.
export function toWeekHours(
  rows: { day_of_week: number; opens_at: string | null; closes_at: string | null; closes_next_day: boolean; is_closed: boolean }[],
): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
    const row = rows.find((candidate) => candidate.day_of_week === dayOfWeek);
    return {
      dayOfWeek,
      isClosed: row ? row.is_closed : true,
      opensAt: row?.opens_at?.slice(0, 5) ?? "",
      closesAt: row?.closes_at?.slice(0, 5) ?? "",
      closesNextDay: row?.closes_next_day ?? false,
    };
  });
}

export function toBranchHoursPayload(hours: DayHours[]) {
  return hours.map((day) => ({
    day_of_week: day.dayOfWeek,
    is_closed: day.isClosed,
    opens_at: day.isClosed ? null : day.opensAt,
    closes_at: day.isClosed ? null : day.closesAt,
    closes_next_day: day.isClosed ? false : day.closesNextDay,
  }));
}
