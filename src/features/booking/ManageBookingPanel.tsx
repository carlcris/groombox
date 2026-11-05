import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { Button } from "@/components/ui/button";
import { startGuestSession } from "@/features/auth/guest-session";
import { TurnstileWidget } from "@/features/auth/TurnstileWidget";
import { bookingPath } from "@/features/booking/booking-code";
import { isClientCancellable, type BookingView } from "@/features/booking/booking-link-queries";
import { CancelBookingDialog } from "@/features/booking/CancelBookingDialog";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

class BotCheckError extends Error {
  readonly code = "captcha_failed";
}

// Takes a guest's booking over on this device, starting a guest session behind the bot check first
// when there is none (app flow §15).
function ClaimBooking({ booking, session, onClaimed }: { booking: BookingView; session: Session | null; onClaimed: () => void }) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [botCheckFailed, setBotCheckFailed] = useState(false);
  const claim = useMutation({
    mutationFn: async () => {
      if (!session) {
        if (!captchaToken) throw new BotCheckError();
        await startGuestSession(captchaToken);
      }
      const { error } = await supabase.rpc("claim_guest_booking", { p_booking_code: booking.bookingCode });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(messages.bookingPage.managedHere);
      onClaimed();
    },
  });
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Smartphone className="size-5 shrink-0" aria-hidden />
        {messages.bookingPage.manageHereBody}
      </p>
      {!session ? <TurnstileWidget onToken={setCaptchaToken} onFailure={() => setBotCheckFailed(true)} /> : null}
      <FormErrorAlert error={botCheckFailed ? new BotCheckError() : claim.error} />
      <Button className="w-full" disabled={claim.isPending || (!session && !captchaToken)} onClick={() => claim.mutate()}>
        {messages.bookingPage.manageHere}
      </Button>
    </section>
  );
}

// What this viewer can do: the creator cancels; anyone else holding a guest's link may take it over;
// a booking made with an account is managed by signing in (app flow §15).
export function ManageBookingPanel({
  booking,
  session,
  onChanged,
}: {
  booking: BookingView;
  session: Session | null;
  onChanged: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const link = `${window.location.origin}${bookingPath(booking.bookingCode)}`;

  if (booking.viewerIsCreator) {
    return (
      <div className="flex flex-col gap-4">
        {session?.user.is_anonymous ? (
          <section className="flex flex-col gap-2 rounded-xl border bg-accent p-4">
            <h2 className="font-medium">{messages.bookingPage.saveLinkTitle}</h2>
            <p className="text-sm">{messages.bookingPage.saveLinkBody}</p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success(messages.bookingPage.linkCopied))}
            >
              <Copy aria-hidden />
              {messages.bookingPage.copyLink}
            </Button>
          </section>
        ) : null}
        {isClientCancellable(booking) ? (
          <>
            <Button variant="outline" className="text-danger" onClick={() => setCancelling(true)}>
              {messages.bookingPage.cancel}
            </Button>
            <CancelBookingDialog bookingId={booking.bookingId} open={cancelling} onOpenChange={setCancelling} onCancelled={onChanged} />
          </>
        ) : null}
      </div>
    );
  }
  if (booking.viewerIsMember) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{messages.bookingPage.readOnlyNotice}</p>
      {booking.bookedByGuest ? (
        <ClaimBooking booking={booking} session={session} onClaimed={onChanged} />
      ) : session && !session.user.is_anonymous ? (
        <p>{messages.bookingPage.otherAccount}</p>
      ) : (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{messages.bookingPage.signInToManageBody}</p>
          <Button asChild variant="outline">
            <Link to="/sign-in" search={{ redirect: bookingPath(booking.bookingCode) }}>
              {messages.bookingPage.signInToManage}
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}
