import { useEffect, useState } from "react";
import { cn } from "@/lib/class-names";
import { formatTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";

const warningSeconds = 120;
const ringRadius = 26;
const ringLength = 2 * Math.PI * ringRadius;

function remainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatRemaining(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// The time left on a hold. The database decides when the hold ends; at zero this only asks for the
// booking again. The text carries the meaning and the ring supports it; screen readers hear it once
// a minute, not every second (design brief §5 and §8).
export function HoldCountdown({
  heldAt,
  expiresAt,
  timeZone,
  onElapsed,
}: {
  heldAt: string;
  expiresAt: string;
  timeZone: string;
  onElapsed: () => void;
}) {
  const [seconds, setSeconds] = useState(() => remainingSeconds(expiresAt));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = remainingSeconds(expiresAt);
      setSeconds(next);
      if (next === 0) {
        window.clearInterval(timer);
        onElapsed();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onElapsed]);

  const isWarning = seconds <= warningSeconds;
  const holdSeconds = Math.max(1, (new Date(expiresAt).getTime() - new Date(heldAt).getTime()) / 1000);
  const fraction = Math.min(1, seconds / holdSeconds);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={ringRadius} className="fill-none stroke-muted" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={ringRadius}
          className={cn("fill-none transition-[stroke-dashoffset] duration-200", isWarning ? "stroke-warning" : "stroke-countdown")}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={ringLength}
          strokeDashoffset={ringLength * (1 - fraction)}
        />
      </svg>
      <div className="flex flex-col">
        <p className={cn("font-heading text-2xl font-semibold tabular-nums", isWarning && "text-warning")}>
          {fillTemplate(messages.bookingPage.timeLeft, { time: formatRemaining(seconds) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {fillTemplate(messages.bookingPage.holdEndsAt, { time: formatTime(expiresAt, timeZone) })}
        </p>
        <p className="sr-only" aria-live="polite">
          {fillTemplate(messages.bookingPage.timeLeft, { time: `${Math.ceil(seconds / 60)} min` })}
        </p>
      </div>
    </div>
  );
}
