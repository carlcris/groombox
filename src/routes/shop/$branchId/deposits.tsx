import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/features/booking/BookingStatusBadge";
import { canReviewDeposits } from "@/features/deposits/deposit-access";
import {
  depositListQueryOptions,
  depositPageSize,
  type DepositBooking,
  type DepositList,
} from "@/features/deposits/deposit-queries";
import { DepositReviewSheet } from "@/features/deposits/DepositReviewSheet";
import { RefundOutcomeSheet } from "@/features/deposits/RefundOutcomeSheet";
import { formatDateTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

// Reported payments to review at one branch, flagged ones first (app flow §6). The shop shell keeps
// the lists live.
export const Route = createFileRoute("/shop/$branchId/deposits")({
  beforeLoad: ({ context, params }) => {
    if (!canReviewDeposits(context.currentMembership)) {
      throw redirect({ to: "/shop/$branchId/floor", params: { branchId: params.branchId } });
    }
  },
  component: DepositsPage,
});

type OpenSheet = { kind: "review" | "refund"; booking: DepositBooking } | null;

function DepositRow({
  booking,
  timeZone,
  detail,
  action,
  onOpen,
}: {
  booking: DepositBooking;
  timeZone: string;
  detail: string;
  action: string | null;
  onOpen: () => void;
}) {
  const isFlagged = booking.status === "review_expired_pending_resolution";
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-medium">{booking.clientName}</span>
          {isFlagged ? (
            <Badge variant="secondary" className="bg-danger-surface text-danger">
              <TriangleAlert aria-hidden />
              {messages.deposits.flagged}
            </Badge>
          ) : (
            <BookingStatusBadge status={booking.status} />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {booking.serviceNames.join(", ")}
          {booking.startAt ? ` · ${formatDateTime(booking.startAt, timeZone)}` : ""}
        </p>
        <p className="text-sm tabular-nums">
          {[
            booking.proof ? formatPeso(booking.proof.amountPaid) : null,
            booking.proof ? messages.paymentMethods[booking.proof.method] : null,
            detail || null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {action ? (
        <Button variant="outline" onClick={onOpen} aria-label={`${action}: ${booking.clientName}`}>
          {action}
        </Button>
      ) : null}
    </li>
  );
}

function DepositSection({
  branchId,
  timeZone,
  list,
  title,
  hint,
  empty,
  onOpen,
}: {
  branchId: string;
  timeZone: string;
  list: DepositList;
  title: string;
  hint?: string;
  empty: string | null;
  onOpen: (booking: DepositBooking) => void;
}) {
  const [page, setPage] = useState(0);
  const bookings = useQuery(depositListQueryOptions(branchId, list, page));
  if (!empty && bookings.data?.totalCount === 0) return null;
  return (
    <section aria-labelledby={`${list}-heading`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${list}-heading`} className="text-xl font-semibold">
          {title}
        </h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {bookings.isPending ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : bookings.isError ? (
        <QueryErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
      ) : bookings.data.totalCount === 0 && empty ? (
        <EmptyState icon={BadgeCheck}>{empty}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {bookings.data.bookings.map((booking) => (
              <DepositRow
                key={booking.id}
                booking={booking}
                timeZone={timeZone}
                detail={
                  list === "to_review" && booking.reviewExpiresAt
                    ? fillTemplate(messages.deposits.reviewBy, { time: formatDateTime(booking.reviewExpiresAt, timeZone) })
                    : list === "waiting_for_client" && booking.proof?.reviewedAt
                      ? fillTemplate(messages.deposits.awaitingSince, { time: formatDateTime(booking.proof.reviewedAt, timeZone) })
                      : ""
                }
                action={list === "to_review" ? messages.deposits.reviewTitle : list === "refunds" ? messages.deposits.recordRefund : null}
                onOpen={() => onOpen(booking)}
              />
            ))}
          </ul>
          <PaginationControls page={page} pageSize={depositPageSize} totalCount={bookings.data.totalCount} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function DepositsPage() {
  const { branch } = Route.useRouteContext();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading>{messages.deposits.title}</PageHeading>
        <p className="text-muted-foreground">{messages.deposits.intro}</p>
      </div>
      <DepositSection
        branchId={branch.id}
        timeZone={branch.timezone}
        list="to_review"
        title={messages.deposits.toReview}
        empty={messages.deposits.noneToReview}
        onOpen={(booking) => setOpenSheet({ kind: "review", booking })}
      />
      <DepositSection
        branchId={branch.id}
        timeZone={branch.timezone}
        list="waiting_for_client"
        title={messages.deposits.waitingForClient}
        hint={messages.deposits.waitingForClientHint}
        empty={null}
        onOpen={() => undefined}
      />
      <DepositSection
        branchId={branch.id}
        timeZone={branch.timezone}
        list="refunds"
        title={messages.deposits.refunds}
        hint={messages.deposits.refundsHint}
        empty={null}
        onOpen={(booking) => setOpenSheet({ kind: "refund", booking })}
      />
      {openSheet?.kind === "review" ? (
        <DepositReviewSheet booking={openSheet.booking} timeZone={branch.timezone} onClose={() => setOpenSheet(null)} />
      ) : null}
      {openSheet?.kind === "refund" ? <RefundOutcomeSheet booking={openSheet.booking} onClose={() => setOpenSheet(null)} /> : null}
    </div>
  );
}
