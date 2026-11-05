import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readAnySession } from "@/features/auth/guest-session";
import { formatBookingCode } from "@/features/booking/booking-code";
import { bookingByCodeQueryKey, bookingByCodeQueryOptions, type BookingView } from "@/features/booking/booking-link-queries";
import { BookingStatusBadge } from "@/features/booking/BookingStatusBadge";
import { BookingSummary } from "@/features/booking/BookingSummary";
import { HoldCountdown } from "@/features/booking/HoldCountdown";
import { ManageBookingPanel } from "@/features/booking/ManageBookingPanel";
import { PaymentDetailsCard } from "@/features/booking/PaymentDetailsCard";
import { PublicPageLayout } from "@/features/booking/PublicPageLayout";
import { ReportPaymentForm } from "@/features/booking/ReportPaymentForm";
import { useBookingUpdates } from "@/features/booking/useBookingUpdates";
import { formatDateTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

// One booking, opened from its link on any device (app flow §15). Status and the next step come
// first, then the summary (design brief §6).
export const Route = createFileRoute("/booking/$bookingCode")({
  beforeLoad: async () => ({ session: await readAnySession() }),
  component: BookingPage,
});

const headlines: Partial<Record<BookingView["status"], string>> = {
  held: messages.bookingPage.heldHeadline,
  hold_expired: messages.bookingPage.holdExpiredHeadline,
  payment_submitted: messages.bookingPage.paymentSubmittedHeadline,
  needs_resubmission: messages.bookingPage.needsResubmissionHeadline,
  review_expired_pending_resolution: messages.bookingPage.reviewExpiredHeadline,
  confirmed: messages.bookingPage.confirmedHeadline,
  cancelled: messages.bookingPage.cancelledHeadline,
  payment_rejected: messages.bookingPage.rejectedHeadline,
};

function ShopNote({ note }: { note: string | null | undefined }) {
  if (!note) return null;
  return (
    <section className="flex flex-col gap-1 rounded-xl border bg-warning-surface p-4">
      <h2 className="text-sm font-medium text-warning">{messages.bookingPage.shopNote}</h2>
      <p className="whitespace-pre-line">{note}</p>
    </section>
  );
}

function ReportedPayment({ booking }: { booking: BookingView }) {
  const proof = booking.latestProof;
  if (!proof?.referenceNumber || proof.amountPaid === null || !proof.method) return null;
  return (
    <section className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="text-sm text-muted-foreground">{messages.bookingPage.youReported}</h2>
      <p className="tabular-nums">
        {formatPeso(proof.amountPaid)} · {messages.paymentMethods[proof.method]} · {proof.referenceNumber}
      </p>
    </section>
  );
}

function NextStep({ booking, onChanged }: { booking: BookingView; onChanged: () => void }) {
  const canReport = booking.viewerIsCreator;
  if (booking.status === "held" && booking.holdExpiresAt) {
    return (
      <div className="flex flex-col gap-4">
        <HoldCountdown
          heldAt={booking.bookedAt}
          expiresAt={booking.holdExpiresAt}
          timeZone={booking.branchTimezone}
          onElapsed={onChanged}
        />
        <p className="text-lg">
          {fillTemplate(messages.bookingPage.payNow, {
            amount: formatPeso(booking.amountDue),
            balance: formatPeso(booking.serviceTotal - booking.depositAmount),
          })}
        </p>
        <p className="text-muted-foreground">{messages.bookingPage.payDirectly}</p>
        {booking.paymentDetails ? <PaymentDetailsCard details={booking.paymentDetails} amountDue={booking.amountDue} /> : null}
        {canReport ? (
          <section aria-labelledby="report-heading" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="report-heading" className="text-xl font-semibold">
                {messages.bookingPage.reportTitle}
              </h2>
              <p className="text-muted-foreground">{messages.bookingPage.reportIntro}</p>
            </div>
            <ReportPaymentForm booking={booking} onReported={onChanged} />
          </section>
        ) : null}
      </div>
    );
  }
  if (booking.status === "needs_resubmission") {
    return (
      <div className="flex flex-col gap-4">
        <p>{messages.bookingPage.resubmitBody}</p>
        <ShopNote note={booking.latestProof?.reviewNote} />
        <ReportedPayment booking={booking} />
        {booking.paymentDetails ? <PaymentDetailsCard details={booking.paymentDetails} amountDue={booking.amountDue} /> : null}
        {canReport ? (
          <section aria-labelledby="report-heading" className="flex flex-col gap-3">
            <h2 id="report-heading" className="text-xl font-semibold">
              {messages.bookingPage.reportAgainTitle}
            </h2>
            <ReportPaymentForm booking={booking} onReported={onChanged} />
          </section>
        ) : null}
      </div>
    );
  }
  if (booking.status === "payment_submitted") {
    return (
      <div className="flex flex-col gap-4">
        {booking.reviewExpiresAt ? (
          <p>{fillTemplate(messages.bookingPage.underReviewBody, { time: formatDateTime(booking.reviewExpiresAt, booking.branchTimezone) })}</p>
        ) : null}
        <ReportedPayment booking={booking} />
      </div>
    );
  }
  if (booking.status === "review_expired_pending_resolution") {
    return (
      <div className="flex flex-col gap-4">
        <p>{messages.bookingPage.reviewExpiredBody}</p>
        <ReportedPayment booking={booking} />
      </div>
    );
  }
  if (booking.status === "payment_rejected") {
    return (
      <div className="flex flex-col gap-3">
        <p>{messages.bookingPage.rejectedBody}</p>
        <ShopNote note={booking.latestProof?.reviewNote} />
        {booking.branchContactNumber ? (
          <p className="font-medium">{fillTemplate(messages.bookingPage.contactShop, { number: booking.branchContactNumber })}</p>
        ) : null}
      </div>
    );
  }
  if (booking.status === "hold_expired") {
    return (
      <div className="flex flex-col gap-3">
        <p>{messages.bookingPage.holdExpiredBody}</p>
        {booking.branchContactNumber ? (
          <p className="font-medium">{fillTemplate(messages.bookingPage.contactShop, { number: booking.branchContactNumber })}</p>
        ) : null}
        <Button asChild>
          <Link to="/b/$branchSlug/book" params={{ branchSlug: booking.branchSlug }}>
            {messages.bookingPage.pickNewTime}
          </Link>
        </Button>
      </div>
    );
  }
  if (booking.status === "cancelled") {
    return <p>{booking.cancelledBy === "shop" ? messages.bookingPage.cancelledByShop : messages.bookingPage.cancelledByYou}</p>;
  }
  return null;
}

function BookingPage() {
  const { bookingCode } = Route.useParams();
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const booking = useQuery(bookingByCodeQueryOptions(bookingCode));
  const followsLive = booking.data ? booking.data.viewerIsCreator || booking.data.viewerIsMember : false;
  useBookingUpdates(followsLive && booking.data ? booking.data.bookingId : null, bookingCode);
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: bookingByCodeQueryKey(bookingCode) });
  }, [bookingCode, queryClient]);

  return (
    <PublicPageLayout>
      {booking.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : booking.isError ? (
        <QueryErrorState error={booking.error} onRetry={() => void booking.refetch()} />
      ) : !booking.data ? (
        <div className="flex flex-col gap-4">
          <PageHeading>{messages.bookingPage.notFoundTitle}</PageHeading>
          <EmptyState icon={SearchX}>{messages.bookingPage.notFoundBody}</EmptyState>
        </div>
      ) : (
        <>
          <header className="flex flex-col gap-3">
            <BookingStatusBadge status={booking.data.status} />
            <PageHeading>{headlines[booking.data.status] ?? messages.bookingPage.otherHeadline}</PageHeading>
            <p className="text-sm text-muted-foreground">
              {messages.bookingPage.code}: <span className="font-medium tabular-nums">{formatBookingCode(booking.data.bookingCode)}</span>
            </p>
          </header>
          <NextStep booking={booking.data} onChanged={refresh} />
          <ManageBookingPanel booking={booking.data} session={session} onChanged={refresh} />
          <BookingSummary booking={booking.data} />
          {booking.data.cancellationPolicy ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">{messages.bookingPage.policyAccepted}</h2>
              <p className="whitespace-pre-line text-muted-foreground">{booking.data.cancellationPolicy}</p>
            </section>
          ) : null}
        </>
      )}
    </PublicPageLayout>
  );
}
