import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouter } from "@tanstack/react-router";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Toaster } from "@/components/ui/sonner";
import { useAppVersionCheck } from "@/hooks/useAppVersionCheck";
import { supabase } from "@/lib/supabase-client";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  useAppVersionCheck();

  // Route guards read the session, so a sign-in or sign-out re-runs them. Signing out drops
  // everything cached for the previous user; signing in (including a guest session starting) fetches
  // cached reads again as the new user.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.clear();
      if (event === "SIGNED_IN") void queryClient.invalidateQueries();
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void router.invalidate();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  // Focus moves to the page heading after each navigation (design brief §8).
  useEffect(
    () =>
      router.subscribe("onResolved", ({ pathChanged }) => {
        if (!pathChanged) return;
        document.querySelector<HTMLElement>("[data-page-heading]")?.focus({ preventScroll: true });
      }),
    [router],
  );

  return (
    <>
      <OfflineBanner />
      <Outlet />
      <Toaster />
    </>
  );
}
