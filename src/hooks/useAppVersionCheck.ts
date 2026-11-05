import { useEffect } from "react";
import { toast } from "sonner";
import { messages } from "@/lib/messages";

// After a deploy, an open tab is running old code. On focus, compare the deployed version file
// with this build's version and offer a reload (TRD §12).
export function useAppVersionCheck(): void {
  useEffect(() => {
    let prompted = false;

    async function checkVersion() {
      if (prompted) return;
      try {
        const response = await fetch("/version.json", { cache: "no-store" });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const deployedVersion =
          typeof body === "object" && body !== null && "version" in body ? body.version : null;
        if (typeof deployedVersion === "string" && deployedVersion !== __APP_VERSION__) {
          prompted = true;
          toast(messages.app.newVersion, {
            duration: Infinity,
            action: { label: messages.app.reload, onClick: () => window.location.reload() },
          });
        }
      } catch {
        // Offline or blocked: the next focus tries again.
      }
    }

    window.addEventListener("focus", checkVersion);
    return () => window.removeEventListener("focus", checkVersion);
  }, []);
}
