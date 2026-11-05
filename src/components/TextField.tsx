import type { HTMLAttributes, HTMLInputTypeAttribute } from "react";
import { fieldIds, FormField, firstFieldError } from "@/components/FormField";
import { Input } from "@/components/ui/input";

export function TextField({
  id,
  label,
  hint,
  type = "text",
  inputMode,
  autoComplete,
  value,
  errors,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  hint?: string;
  type?: HTMLInputTypeAttribute;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  value: string;
  errors: readonly unknown[];
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const error = firstFieldError(errors);
  const { hintId, errorId } = fieldIds(id);
  return (
    <FormField id={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, errorId].filter(Boolean).join(" ")}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </FormField>
  );
}
