import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/features/booking/BookingStatusBadge";
import { CheckoutForm } from "@/features/checkout/CheckoutForm";
import { saleQueryOptions, visitDetailQueryOptions } from "@/features/checkout/checkout-queries";
import { SaleSummary } from "@/features/checkout/SaleSummary";
import { canReviewDeposits } from "@/features/deposits/deposit-access";
import { RefundOutcomeSheet } from "@/features/deposits/RefundOutcomeSheet";
import { availableVisitActions } from "@/features/floor/visit-actions";
import { useVisitUpdates } from "@/features/floor/useVisitUpdates";
import { VisitSheet } from "@/features/floor/VisitSheet";
import { formatDateTime, formatTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

// One visit: its details and next moves, checkout once service has started, and the sale once it
// is done (app flow §8).
export const Route = createFileRoute("/shop/$branchId/visit/$bookingId")({
  component: VisitPage,
});

function VisitPage() {
  const { branch, currentMembership } = Route.useRouteContext();
  const { bookingId } = Route.useParams();
  const [managing, setManaging] = useState(false);
  const [recordingRefund, setRecordingRefund] = useState(false);
  useVisitUpdates(branch.id);
  const visit = useQuery(visitDetailQueryOptions(branch.id, bookingId));
  const isCompleted = visit.data?.status === "completed";
  const sale = useQuery({ ...saleQueryOptions(branch.id, bookingId), enabled: isCompleted });

  if (visit.isPending) return <Skeleton className="h-96 max-w-3xl rounded-xl" />;
  if (visit.isError) return <QueryErrorState error={visit.error} onRetry={() => void visit.refetch()} />;
  if (!visit.data) return <EmptyState icon={SearchX}>{messages.visit.notFound}</EmptyState>;

  const refundDue = sale.data ? Math.round((visit.data.depositAmount - sale.data.depositApplied) * 100) / 100 : 0;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <BookingStatusBadge status={visit.data.status} />
        <PageHeading>{visit.data.clientName}</PageHeading>
        <p className="text-muted-foreground">
          {visit.data.serviceNames.join(", ")} · {visit.data.staffName ?? messages.floor.anyStaff}
          {visit.data.startAt
            ? ` · ${formatDateTime(visit.data.startAt, branch.timezone)}${visit.data.endAt ? ` – ${formatTime(visit.data.endAt, branch.timezone)}` : ""}`
            : ""}
        </p>
        {availableVisitActions(visit.data).length > 0 ? (
          <Button variant="outline" className="self-start" onClick={() => setManaging(true)}>
            {messages.visit.manage}
          </Button>
        ) : null}
      </header>

      {visit.data.status === "in_service" ? (
        <section aria-labelledby="checkout-heading" className="flex flex-col gap-4">
          <h2 id="checkout-heading" className="font-heading text-2xl font-semibold">
            {messages.visit.checkout}
          </h2>
          <CheckoutForm branchId={branch.id} visit={visit.data} onCompleted={() => void sale.refetch()} />
        </section>
      ) : null}

      {isCompleted ? (
        sale.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : sale.isError ? (
          <QueryErrorState error={sale.error} onRetry={() => void sale.refetch()} />
        ) : sale.data ? (
          <>
            <SaleSummary sale={sale.data} />
            {refundDue > 0 ? (
              <section className="flex flex-col gap-3 rounded-xl border bg-warning-surface p-4">
                {visit.data.refund ? (
                  <p className="text-warning">
                    {visit.data.refund.refunded
                      ? fillTemplate(messages.visit.refundRecorded, { amount: formatPeso(visit.data.refund.amount) })
                      : messages.visit.noRefund}
                  </p>
                ) : (
                  <>
                    <p className="font-medium text-warning">{fillTemplate(messages.visit.refundDue, { amount: formatPeso(refundDue) })}</p>
                    {canReviewDeposits(currentMembership) ? (
                      <Button variant="outline" className="self-start" onClick={() => setRecordingRefund(true)}>
                        {messages.visit.recordRefund}
                      </Button>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
          </>
        ) : null
      ) : null}

      {managing ? <VisitSheet branch={branch} visit={visit.data} initialMode="details" onClose={() => setManaging(false)} /> : null}
      {recordingRefund ? (
        <RefundOutcomeSheet
          bookingId={visit.data.id}
          clientName={visit.data.clientName}
          suggestedAmount={refundDue}
          onClose={() => setRecordingRefund(false)}
        />
      ) : null}
    </div>
  );
}
