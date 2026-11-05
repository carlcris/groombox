import { useMutation } from "@tanstack/react-query";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { Button } from "@/components/ui/button";
import { InAppBrowserNotice } from "@/features/auth/InAppBrowserNotice";
import { isInAppBrowser } from "@/lib/in-app-browser";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export type SocialProvider = "google" | "facebook";

const providerLabels: Record<SocialProvider, string> = {
  google: messages.auth.withGoogle,
  facebook: messages.auth.withFacebook,
};

// Members may sign in with Google; clients with Google or Facebook (TRD §5). Google refuses to sign
// in inside the Messenger and Instagram browsers, so there the notice to open the page in the phone's
// browser takes its place. Local tests sign in as seeded email users instead; real social sign-in is
// checked by hand on the hosted project.
export function SocialSignInButtons({ providers, redirectPath }: { providers: SocialProvider[]; redirectPath: string }) {
  const insideInAppBrowser = isInAppBrowser(navigator.userAgent);
  const signIn = useMutation({
    mutationFn: async (provider: SocialProvider) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${redirectPath}` },
      });
      if (error) throw error;
    },
  });
  const offered = providers.filter((provider) => !(insideInAppBrowser && provider === "google"));
  return (
    <div className="flex flex-col gap-3">
      {insideInAppBrowser && providers.includes("google") ? <InAppBrowserNotice /> : null}
      {offered.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="w-full"
          disabled={signIn.isPending}
          onClick={() => signIn.mutate(provider)}
        >
          {providerLabels[provider]}
        </Button>
      ))}
      <FormErrorAlert error={signIn.error} />
    </div>
  );
}
