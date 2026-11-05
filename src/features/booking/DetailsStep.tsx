import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { startGuestSession } from "@/features/auth/guest-session";
import { TurnstileWidget } from "@/features/auth/TurnstileWidget";
import { clientDetailsSchema, ownProfileQueryOptions, type ClientDetails } from "@/features/booking/client-details";
import { messages } from "@/lib/messages";

class BotCheckError extends Error {
  readonly code = "captcha_failed";
}

function DetailsForm({
  initialDetails,
  needsGuestSession,
  onContinue,
}: {
  initialDetails: ClientDetails;
  needsGuestSession: boolean;
  onContinue: (details: ClientDetails) => void;
}) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [botCheckFailed, setBotCheckFailed] = useState(false);
  const proceed = useMutation({
    mutationFn: async (details: ClientDetails) => {
      if (needsGuestSession) {
        if (!captchaToken) throw new BotCheckError();
        await startGuestSession(captchaToken);
      }
      return details;
    },
    onSuccess: onContinue,
  });
  const form = useForm({
    defaultValues: initialDetails,
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: clientDetailsSchema },
    onSubmit: async ({ value }) => {
      await proceed.mutateAsync({ fullName: value.fullName.trim(), mobileNumber: value.mobileNumber.trim() }).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="fullName">
        {(field) => (
          <TextField
            id="client-name"
            label={messages.booking.fullName}
            autoComplete="name"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="mobileNumber">
        {(field) => (
          <TextField
            id="client-mobile"
            label={messages.booking.mobileNumber}
            hint={messages.booking.mobileHint}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      {needsGuestSession ? (
        <TurnstileWidget onToken={setCaptchaToken} onFailure={() => setBotCheckFailed(true)} />
      ) : null}
      <FormErrorAlert error={botCheckFailed ? new BotCheckError() : proceed.error} />
      <StickyActionBar>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting || (needsGuestSession && !captchaToken)}>
              {needsGuestSession ? messages.booking.guestTitle : messages.booking.continue}
            </Button>
          )}
        </form.Subscribe>
      </StickyActionBar>
    </form>
  );
}

function AccountDetails({ userId, onContinue }: { userId: string; onContinue: (details: ClientDetails) => void }) {
  const profile = useQuery(ownProfileQueryOptions(userId));
  if (profile.isPending) return <Skeleton className="h-48 rounded-xl" />;
  return (
    <DetailsForm
      initialDetails={profile.data ?? { fullName: "", mobileNumber: "" }}
      needsGuestSession={false}
      onContinue={onContinue}
    />
  );
}

// Step 4: a signed-in client confirms their name and number; a returning guest's session is reused;
// a visitor continues as a guest behind the bot check or signs in, keeping their choices (app flow §4).
export function DetailsStep({
  session,
  details,
  signInRedirect,
  onContinue,
}: {
  session: Session | null;
  details: ClientDetails | null;
  signInRedirect: string;
  onContinue: (details: ClientDetails) => void;
}) {
  if (session && !session.user.is_anonymous) {
    if (details) return <DetailsForm initialDetails={details} needsGuestSession={false} onContinue={onContinue} />;
    return <AccountDetails userId={session.user.id} onContinue={onContinue} />;
  }
  return (
    <div className="flex flex-1 flex-col gap-6">
      {session ? null : (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-medium">{messages.booking.signInTitle}</h2>
          <p className="text-sm text-muted-foreground">{messages.booking.signInBody}</p>
          <Button variant="outline" asChild className="self-start">
            <Link to="/sign-in" search={{ redirect: signInRedirect }}>
              {messages.booking.signInButton}
            </Link>
          </Button>
        </section>
      )}
      <section className="flex flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">{messages.booking.guestTitle}</h2>
          <p className="text-sm text-muted-foreground">{messages.booking.guestIntro}</p>
        </div>
        <DetailsForm
          initialDetails={details ?? { fullName: "", mobileNumber: "" }}
          needsGuestSession={!session}
          onContinue={onContinue}
        />
      </section>
    </div>
  );
}
