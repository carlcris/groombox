// "15 min", "1 hr", "1 hr 30 min", "1 day".
export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes >= 1440 && totalMinutes % 1440 === 0) {
    const days = totalMinutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
