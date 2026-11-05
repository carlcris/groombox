// Dates read "Sat, 10 Oct" and times use the 12-hour clock, "2:30 PM" (design brief §9).
const dateTimeFormat = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFormat = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short" });

function partsOf(format: Intl.DateTimeFormat, value: Date) {
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

export function formatDate(isoTimestamp: string): string {
  const parts = partsOf(dateFormat, new Date(isoTimestamp));
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}

export function formatDateTime(isoTimestamp: string): string {
  const parts = partsOf(dateTimeFormat, new Date(isoTimestamp));
  return `${parts.weekday}, ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}
