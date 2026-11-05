import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { describeError } from "@/lib/error-messages";

// A failed submit, shown in the form itself so a toast is never the only place it appears.
export function FormErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{describeError(error)}</AlertDescription>
    </Alert>
  );
}
