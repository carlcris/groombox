import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// A visible label, an optional hint, and the error under the field. The error is an alert, so screen
// readers announce it when it appears (design brief §8). The control itself is passed in and wired with the ids from `fieldIds`.
export function fieldIds(id: string) {
  return { hintId: `${id}-hint`, errorId: `${id}-error` };
}

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const { hintId, errorId } = fieldIds(id);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base font-medium">
        {label}
      </Label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The first message of a TanStack Form field's errors (Standard Schema issues or strings).
export function firstFieldError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return undefined;
}
