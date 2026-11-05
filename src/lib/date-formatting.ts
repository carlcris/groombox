// Dates read "Sat, 10 Oct" and times use the 12-hour clock, "2:30 PM" (design brief §9). Branch
// data is shown in the branch's time zone; personal data (notifications) in the device's.

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function readParts(value: Date, timeZone: string | undefined): DateParts {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(format.formatToParts(value).map((part) => [part.type, Number(part.value)]));
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function displayParts(value: Date, timeZone: string | undefined) {
  const format = new Intl.DateTimeFormat("en-PH", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const parts = Object.fromEntries(format.formatToParts(value).map((part) => [part.type, part.value]));
  return {
    weekday: parts.weekday ?? "",
    day: parts.day ?? "",
    month: parts.month ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
    dayPeriod: (parts.dayPeriod ?? "").toUpperCase(),
  };
}

export function formatDate(isoTimestamp: string, timeZone?: string): string {
  const parts = displayParts(new Date(isoTimestamp), timeZone);
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}

export function formatDateTime(isoTimestamp: string, timeZone?: string): string {
  const parts = displayParts(new Date(isoTimestamp), timeZone);
  return `${parts.weekday}, ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

// "14:00" → "2:00 PM".
export function formatTimeOfDay(time: string): string {
  const [hourText = "0", minute = "00"] = time.split(":");
  const hour = Number(hourText);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

function offsetMinutes(instant: number, timeZone: string): number {
  const parts = readParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - Math.floor(instant / 1000) * 1000) / 60_000;
}

// A wall-clock time at the branch ("2026-11-07T10:00", as a datetime-local input gives it) as an
// ISO timestamp. The second pass settles times next to a daylight-saving change.
export function branchLocalToIso(localDateTime: string, timeZone: string): string {
  const [datePart = "", timePart = "00:00"] = localDateTime.split("T");
  const [year = 0, month = 1, day = 1] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = timePart.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wallClock - offsetMinutes(wallClock, timeZone) * 60_000;
  instant = wallClock - offsetMinutes(instant, timeZone) * 60_000;
  return new Date(instant).toISOString();
}

// Now, as a datetime-local value at the branch.
export function branchLocalNow(timeZone: string): string {
  const parts = readParts(new Date(), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

// Business dates are plain dates ("2026-11-07") with no time zone; they are shown and counted as
// calendar dates.
function businessDateToUtc(businessDate: string): Date {
  const [year = 0, month = 1, day = 1] = businessDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatBusinessDate(businessDate: string): string {
  const parts = displayParts(businessDateToUtc(businessDate), "UTC");
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}

export function addDaysToBusinessDate(businessDate: string, days: number): string {
  const date = businessDateToUtc(businessDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 0 for Sunday, as branch_hours.day_of_week counts.
export function businessDateDayOfWeek(businessDate: string): number {
  return businessDateToUtc(businessDate).getUTCDay();
}

export function formatTime(isoTimestamp: string, timeZone: string): string {
  const parts = displayParts(new Date(isoTimestamp), timeZone);
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

function localDate(isoTimestamp: string, timeZone: string): string {
  const parts = readParts(new Date(isoTimestamp), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

// A time on a business date. After midnight at a late-night branch it carries the calendar day:
// "1:00 AM (Sun)" (design brief §9).
export function formatBusinessDayTime(isoTimestamp: string, timeZone: string, businessDate: string): string {
  const time = formatTime(isoTimestamp, timeZone);
  if (localDate(isoTimestamp, timeZone) === businessDate) return time;
  return `${time} (${displayParts(new Date(isoTimestamp), timeZone).weekday})`;
}
