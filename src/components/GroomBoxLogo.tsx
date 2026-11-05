import { messages } from "@/lib/messages";

// The mark: a rounded teal box holding an amber four-point sparkle, beside the wordmark
// (design brief §10).
export function GroomBoxLogo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M16 7c1 5 3 8 9 9-6 1-8 4-9 9-1-5-3-8-9-9 6-1 8-4 9-9Z" className="fill-brand-accent" />
      </svg>
      <span className="font-heading text-xl font-semibold text-foreground">{messages.app.name}</span>
    </span>
  );
}
