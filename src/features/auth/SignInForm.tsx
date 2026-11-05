import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { signInSchema } from "@/features/auth/auth-schemas";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export function SignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const signIn = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
    },
    onSuccess: onSignedIn,
  });
  const form = useForm({
    defaultValues: { email: "", password: "" },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: signInSchema },
    onSubmit: async ({ value }) => {
      await signIn.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <TextField
            id="email"
            label={messages.auth.email}
            type="email"
            autoComplete="email"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <TextField
            id="password"
            label={messages.auth.password}
            type="password"
            autoComplete="current-password"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <FormErrorAlert error={signIn.error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {messages.auth.signInButton}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
