import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { messages } from "@/lib/messages";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warning-surface px-4 py-2 text-sm text-warning">
      <WifiOff className="size-5" aria-hidden />
      {messages.app.offline}
    </div>
  );
}
