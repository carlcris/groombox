import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { fieldIds, FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { branchLocalNow, branchLocalToIso } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";

export type DateRangeEntry = { startsAt: string; endsAt: string; reason: string | null };

// Start and end times as wall-clock times at the branch, with an optional reason. Used for
// closures and time off; `extraFields` adds the staff picker for time off.
export function DateRangeForm({
  idPrefix,
  timeZone,
  fromLabel,
  untilLabel,
  submitLabel,
  isSaving,
  error,
  extraFields,
  onSubmit,
}: {
  idPrefix: string;
  timeZone: string;
  fromLabel: string;
  untilLabel: string;
  submitLabel: string;
  isSaving: boolean;
  error: unknown;
  extraFields?: ReactNode;
  onSubmit: (entry: DateRangeEntry, reset: () => void) => void;
}) {
  const [startsAt, setStartsAt] = useState(branchLocalNow(timeZone));
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const endsId = `${idPrefix}-ends`;

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-lg bg-muted p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!startsAt || !endsAt) return setProblem(messages.validation.required);
        if (endsAt <= startsAt) return setProblem(messages.validation.endsAfterStarts);
        setProblem(null);
        onSubmit(
          { startsAt: branchLocalToIso(startsAt, timeZone), endsAt: branchLocalToIso(endsAt, timeZone), reason: reason.trim() || null },
          () => {
            setEndsAt("");
            setReason("");
          },
        );
      }}
    >
      {extraFields}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id={`${idPrefix}-starts`} label={fromLabel}>
          <Input id={`${idPrefix}-starts`} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </FormField>
        <FormField id={endsId} label={untilLabel} error={problem ?? undefined}>
          <Input id={endsId} type="datetime-local" value={endsAt} aria-invalid={problem ? true : undefined}
            aria-describedby={fieldIds(endsId).errorId} onChange={(event) => setEndsAt(event.target.value)} />
        </FormField>
      </div>
      <FormField id={`${idPrefix}-reason`} label={messages.branchSetup.reason}>
        <Input id={`${idPrefix}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      <FormErrorAlert error={error} />
      <Button type="submit" variant="outline" disabled={isSaving} className="md:self-start">
        <Plus aria-hidden />
        {submitLabel}
      </Button>
    </form>
  );
}
