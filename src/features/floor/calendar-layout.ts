import type { Visit } from "@/features/floor/visit-queries";
import { addDaysToBusinessDate, businessDateDayOfWeek, isoToBranchLocal } from "@/lib/date-formatting";

export type BranchDayHours = { dayOfWeek: number; opensAt: string | null; closesAt: string | null; closesNextDay: boolean; isClosed: boolean };

const minutesPerDay = 1440;
const fallbackOpen = 8 * 60;
const fallbackClose = 20 * 60;

function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function dayDifference(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

// Minutes from midnight at the start of a business date to a moment, at the branch. A time after
// midnight on a late-night business day counts past 24 hours, so it sits below the evening.
export function minutesIntoBusinessDate(isoTimestamp: string, timeZone: string, businessDate: string): number {
  const local = isoToBranchLocal(isoTimestamp, timeZone);
  return dayDifference(businessDate, local.slice(0, 10)) * minutesPerDay + timeToMinutes(local.slice(11, 16));
}

// The hours the grid shows: from the earliest opening to the latest closing of the days shown,
// widened to fit any visit outside them, on whole hours.
export function calendarHourRange(
  dates: string[],
  hours: BranchDayHours[],
  visits: Visit[],
  timeZone: string,
): { startMinute: number; endMinute: number } {
  let startMinute = Number.POSITIVE_INFINITY;
  let endMinute = Number.NEGATIVE_INFINITY;
  for (const date of dates) {
    const day = hours.find((entry) => entry.dayOfWeek === businessDateDayOfWeek(date));
    if (!day || day.isClosed || !day.opensAt || !day.closesAt) continue;
    startMinute = Math.min(startMinute, timeToMinutes(day.opensAt));
    endMinute = Math.max(endMinute, timeToMinutes(day.closesAt) + (day.closesNextDay ? minutesPerDay : 0));
  }
  for (const visit of visits) {
    if (!visit.startAt || !visit.endAt) continue;
    startMinute = Math.min(startMinute, minutesIntoBusinessDate(visit.startAt, timeZone, visit.businessDate));
    endMinute = Math.max(endMinute, minutesIntoBusinessDate(visit.endAt, timeZone, visit.businessDate));
  }
  if (!Number.isFinite(startMinute)) return { startMinute: fallbackOpen, endMinute: fallbackClose };
  return { startMinute: Math.floor(startMinute / 60) * 60, endMinute: Math.ceil(endMinute / 60) * 60 };
}

// The seven business dates of the week (Monday first) holding a date.
export function weekDates(date: string): string[] {
  const offset = (businessDateDayOfWeek(date) + 6) % 7;
  const monday = addDaysToBusinessDate(date, -offset);
  return Array.from({ length: 7 }, (_, index) => addDaysToBusinessDate(monday, index));
}
