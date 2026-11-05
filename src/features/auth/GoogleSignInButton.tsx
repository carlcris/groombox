import { useMutation } from "@tanstack/react-query";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

// Members may sign in with Google (TRD §5). Local tests sign in with seeded email users instead;
// real Google sign-in is checked by hand on the hosted project.
export function GoogleSignInButton({ redirectPath }: { redirectPath: string }) {
  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${redirectPath}` },
      });
      if (error) throw error;
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" className="w-full" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
        {messages.auth.withGoogle}
      </Button>
      <FormErrorAlert error={signIn.error} />
    </div>
  );
}
