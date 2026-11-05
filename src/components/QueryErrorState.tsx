import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/error-messages";
import { messages } from "@/lib/messages";

export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border bg-danger-surface px-6 py-8 text-center">
      <CircleAlert className="size-6 text-danger" aria-hidden />
      <p className="text-danger">{describeError(error)}</p>
      <Button variant="outline" onClick={onRetry}>
        {messages.errors.tryAgain}
      </Button>
    </div>
  );
}
