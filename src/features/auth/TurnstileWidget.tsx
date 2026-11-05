import { useEffect, useRef } from "react";
import { messages } from "@/lib/messages";

// Cloudflare Turnstile, the bot check in front of guest sessions (TRD §5). Its script loads only
// on the screens that start a guest session. The site key is public and set per environment.

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load.")));
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error("Turnstile did not load."));
    };
    document.head.append(script);
  });
  return scriptLoad;
}

export function TurnstileWidget({ onToken, onFailure }: { onToken: (token: string | null) => void; onFailure: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onFailure });
  handlers.current = { onToken, onFailure };

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetId = turnstile.render(containerRef.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          callback: (token) => handlers.current.onToken(token),
          "error-callback": () => {
            handlers.current.onToken(null);
            handlers.current.onFailure();
          },
          "expired-callback": () => handlers.current.onToken(null),
        });
      })
      .catch(() => handlers.current.onFailure());
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} data-testid="bot-check" />
      <p className="sr-only" role="status">
        {messages.auth.botCheck}
      </p>
    </div>
  );
}
