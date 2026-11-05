import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AmountRow } from "@/components/AmountRow";
import { CheckboxField } from "@/components/CheckboxField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { QueryErrorState } from "@/components/QueryErrorState";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TaskSheet } from "@/components/TaskSheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingQuoteQueryOptions } from "@/features/booking/availability-queries";
import type { ClientDetails } from "@/features/booking/client-details";
import { privacyNoticeVersion } from "@/features/booking/privacy-notice";
import type { PublicBranch, PublicBranchService } from "@/features/booking/public-branch-queries";
import { ServicePrice } from "@/features/booking/ServiceStep";
import { formatBusinessDate, formatBusinessDayTime } from "@/lib/date-formatting";
import { formatMinutes } from "@/lib/duration-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export type HoldRequest = {
  branch: PublicBranch;
  services: PublicBranchService[];
  staffId: string | null;
  staffLabel: string;
  businessDate: string;
  startAt: string;
  details: ClientDetails;
};

function readErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
}

// Step 5: the summary, the amounts the database calculates, and acceptance of the cancellation
// policy and the privacy notice before the hold is created (app flow §4).
export function ReviewStep({
  request,
  onHeld,
  onSlotTaken,
}: {
  request: HoldRequest;
  onHeld: (bookingCode: string) => void;
  onSlotTaken: () => void;
}) {
  const { branch, services, details } = request;
  const serviceIds = services.map((service) => service.id);
  const quote = useQuery(bookingQuoteQueryOptions(branch.id, serviceIds));
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const duration = services.reduce((sum, service) => sum + service.durationMinutes, 0);

  const hold = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_online_booking", {
        p_branch_id: branch.id,
        p_service_ids: serviceIds,
        p_start_at: request.startAt,
        p_client_name: details.fullName,
        p_mobile_number: details.mobileNumber,
        p_privacy_notice_version: privacyNoticeVersion,
        p_staff_id: request.staffId ?? undefined,
      });
      if (error) throw error;
      const booking = data[0];
      if (!booking) throw new Error("create_online_booking returned no booking.");
      return booking.booking_code;
    },
    onSuccess: onHeld,
    onError: (error) => {
      if (readErrorCode(error) === "GBB03") onSlotTaken();
    },
  });

  return (
    <>
      <dl className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{messages.booking.services}</dt>
          {services.map((service) => (
            <dd key={service.id} className="flex justify-between gap-4">
              <span>
                {service.name} <span className="text-sm text-muted-foreground">· {formatMinutes(service.durationMinutes)}</span>
              </span>
              <span className="tabular-nums">
                <ServicePrice service={service} />
              </span>
            </dd>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{messages.booking.staff}</dt>
          <dd>{request.staffLabel}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{messages.booking.when}</dt>
          <dd className="tabular-nums">
            {formatBusinessDate(request.businessDate)}, {formatBusinessDayTime(request.startAt, branch.timezone, request.businessDate)} ·{" "}
            {formatMinutes(duration)}
          </dd>
        </div>
      </dl>

      {quote.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : quote.isError ? (
        <QueryErrorState error={quote.error} onRetry={() => void quote.refetch()} />
      ) : !quote.data ? (
        <p role="alert" className="text-danger">
          {messages.booking.quoteFailed}
        </p>
      ) : (
        <dl className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <AmountRow label={messages.booking.serviceTotal} amount={quote.data.serviceTotal} />
          <AmountRow label={messages.booking.deposit} amount={quote.data.depositAmount} />
          <AmountRow label={messages.booking.convenienceFee} amount={quote.data.convenienceFee} />
          <AmountRow label={messages.booking.dueNow} amount={quote.data.amountDue} emphasis />
          <AmountRow label={messages.booking.dueAtShop} amount={quote.data.serviceTotal - quote.data.depositAmount} />
          {services.some((service) => service.priceIsStarting) ? (
            <p className="text-sm text-muted-foreground">{messages.booking.startingPriceNote}</p>
          ) : null}
        </dl>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{messages.booking.cancellationPolicy}</h2>
        <p className="whitespace-pre-line text-muted-foreground">{branch.cancellationPolicy || messages.booking.noCancellationPolicy}</p>
      </section>

      <div className="flex flex-col gap-1">
        <CheckboxField label={messages.booking.acceptPolicy} checked={acceptedPolicy} onChange={setAcceptedPolicy} />
        <CheckboxField label={messages.booking.acceptPrivacy} checked={acceptedPrivacy} onChange={setAcceptedPrivacy} />
        <Button variant="link" className="self-start px-0" onClick={() => setPrivacyOpen(true)}>
          {messages.booking.readPrivacy}
        </Button>
      </div>
      <TaskSheet open={privacyOpen} onOpenChange={setPrivacyOpen} title={messages.booking.privacyTitle}>
        <p className="pb-2">{messages.booking.privacyBody}</p>
      </TaskSheet>

      <StickyActionBar>
        <p className="text-sm text-muted-foreground">
          {fillTemplate(messages.booking.holdExplainer, { minutes: String(branch.holdMinutes) })}
        </p>
        <FormErrorAlert error={hold.error} />
        <Button
          className="w-full"
          disabled={!acceptedPolicy || !acceptedPrivacy || !quote.data || hold.isPending}
          onClick={() => hold.mutate()}
        >
          {messages.booking.holdButton}
        </Button>
      </StickyActionBar>
    </>
  );
}
