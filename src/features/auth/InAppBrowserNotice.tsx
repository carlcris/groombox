import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

// Shown in place of Google sign-in inside the Messenger and Instagram browsers (TRD §5).
export function InAppBrowserNotice() {
  return (
    <Alert>
      <ExternalLink aria-hidden />
      <AlertTitle>{messages.auth.inAppBrowserTitle}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{messages.auth.inAppBrowserBody}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => toast.success(messages.auth.pageLinkCopied))}
        >
          {messages.auth.copyPageLink}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
