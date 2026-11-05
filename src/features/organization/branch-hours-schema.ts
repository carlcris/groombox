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

// Hours belong to the day they open. Late hours may close after midnight but must end by the
// start of the next business day, so one opening never spans two business dates. The screen owns
// this check; the database does not repeat it.
export function dayHoursSchema(businessDayStart: string) {
  return z
    .object({
      dayOfWeek: z.number(),
      isClosed: z.boolean(),
      opensAt: z.string(),
      closesAt: z.string(),
      closesNextDay: z.boolean(),
    })
    .superRefine((day, context) => {
      if (day.isClosed) return;
      if (!day.opensAt || !day.closesAt) {
        context.addIssue({ code: "custom", message: messages.validation.hoursRequired, path: ["closesAt"] });
        return;
      }
      if (day.opensAt < businessDayStart) {
        context.addIssue({ code: "custom", message: messages.validation.opensFromBusinessDayStart, path: ["opensAt"] });
      }
      if (day.closesNextDay && day.closesAt > businessDayStart) {
        context.addIssue({ code: "custom", message: messages.validation.closesByBusinessDayStart, path: ["closesAt"] });
      }
      if (!day.closesNextDay && day.closesAt <= day.opensAt) {
        context.addIssue({ code: "custom", message: messages.validation.closesAfterOpens, path: ["closesAt"] });
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

export function toBranchHoursPayload(hours: DayHours[]) {
  return hours.map((day) => ({
    day_of_week: day.dayOfWeek,
    is_closed: day.isClosed,
    opens_at: day.isClosed ? null : day.opensAt,
    closes_at: day.isClosed ? null : day.closesAt,
    closes_next_day: day.isClosed ? false : day.closesNextDay,
  }));
}
