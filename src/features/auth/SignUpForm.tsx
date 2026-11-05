import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { signUpSchema } from "@/features/auth/auth-schemas";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

type SignUpOutcome = "signed_in" | "confirmation_sent";

export function SignUpForm({ onSignedIn }: { onSignedIn: () => void }) {
  const signUp = useMutation({
    mutationFn: async (details: { fullName: string; email: string; password: string }): Promise<SignUpOutcome> => {
      const { data, error } = await supabase.auth.signUp({
        email: details.email,
        password: details.password,
        options: { data: { full_name: details.fullName.trim() } },
      });
      if (error) throw error;
      return data.session ? "signed_in" : "confirmation_sent";
    },
    onSuccess: (outcome) => {
      if (outcome === "signed_in") onSignedIn();
    },
  });
  const form = useForm({
    defaultValues: { fullName: "", email: "", password: "" },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: signUpSchema },
    onSubmit: async ({ value }) => {
      await signUp.mutateAsync(value).catch(() => undefined);
    },
  });

  if (signUp.data === "confirmation_sent") {
    return <p role="status">{messages.auth.checkEmail}</p>;
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="fullName">
        {(field) => (
          <TextField
            id="full-name"
            label={messages.auth.fullName}
            autoComplete="name"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
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
            hint={messages.auth.passwordHint}
            type="password"
            autoComplete="new-password"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <FormErrorAlert error={signUp.error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {messages.auth.signUpButton}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
