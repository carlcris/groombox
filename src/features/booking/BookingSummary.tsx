import { AmountRow } from "@/components/AmountRow";
import type { BookingView } from "@/features/booking/booking-link-queries";
import { formatDateTime, formatTime } from "@/lib/date-formatting";
import { formatMinutes } from "@/lib/duration-formatting";
import { messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

// The booking summary. The end shown is when the last service ends; clean-up time is not shown to
// the client (BKG-11).
export function BookingSummary({ booking }: { booking: BookingView }) {
  return (
    <section aria-labelledby="booking-summary-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <h2 id="booking-summary-heading" className="text-lg font-medium">
        {messages.bookingPage.summary}
      </h2>
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col">
          <dt className="text-sm text-muted-foreground">{messages.bookingPage.shop}</dt>
          <dd className="font-medium">
            {booking.organizationName} · {booking.branchName}
          </dd>
          <dd className="text-sm text-muted-foreground">{booking.branchAddress}</dd>
        </div>
        {booking.startAt ? (
          <div className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{messages.booking.when}</dt>
            <dd className="tabular-nums">
              {formatDateTime(booking.startAt, booking.branchTimezone)}
              {booking.servicesEndAt ? ` – ${formatTime(booking.servicesEndAt, booking.branchTimezone)}` : null}
            </dd>
          </div>
        ) : null}
        {booking.staffDisplayName ? (
          <div className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{messages.booking.staff}</dt>
            <dd>{booking.staffDisplayName}</dd>
          </div>
        ) : null}
        {booking.clientName ? (
          <div className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{messages.bookingPage.bookedFor}</dt>
            <dd>{booking.clientName}</dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{messages.booking.services}</dt>
          {booking.services.map((service, index) => (
            <dd key={index} className="flex justify-between gap-4">
              <span>
                {service.name} <span className="text-sm text-muted-foreground">· {formatMinutes(service.durationMinutes)}</span>
              </span>
              <span className="tabular-nums">{formatPeso(service.price)}</span>
            </dd>
          ))}
        </div>
        {booking.clientNote ? (
          <div className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{messages.bookingPage.note}</dt>
            <dd>{booking.clientNote}</dd>
          </div>
        ) : null}
      </dl>
      <dl className="flex flex-col gap-2 border-t pt-3">
        <AmountRow label={messages.booking.serviceTotal} amount={booking.serviceTotal} />
        <AmountRow label={messages.booking.deposit} amount={booking.depositAmount} />
        <AmountRow label={messages.booking.convenienceFee} amount={booking.convenienceFee} />
        <AmountRow label={messages.booking.dueNow} amount={booking.amountDue} emphasis />
        <AmountRow label={messages.booking.dueAtShop} amount={booking.serviceTotal - booking.depositAmount} />
      </dl>
    </section>
  );
}
