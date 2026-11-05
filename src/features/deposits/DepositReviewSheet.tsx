import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AmountRow } from "@/components/AmountRow";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProofStatus } from "@/features/booking/booking-link-queries";
import type { DepositBooking } from "@/features/deposits/deposit-queries";
import { cn } from "@/lib/class-names";
import { formatDateTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";
import { privateImageUrl } from "@/lib/stored-images";
import { supabase } from "@/lib/supabase-client";

type Decision = Extract<ProofStatus, "accepted" | "resubmission_requested" | "rejected">;

const decisionToasts: Record<Decision, string> = {
  accepted: messages.deposits.accepted,
  resubmission_requested: messages.deposits.resubmissionRequested,
  rejected: messages.deposits.rejected,
};

function ProofScreenshot({ path }: { path: string }) {
  const url = useQuery({ queryKey: ["payment-proof-url", path], queryFn: () => privateImageUrl("payment-proofs", path), staleTime: 50_000 });
  if (url.isPending) return <Skeleton className="h-64 rounded-lg" />;
  if (url.isError) return <FormErrorAlert error={url.error} />;
  return <img src={url.data} alt={messages.deposits.openScreenshot} className="max-h-96 w-full rounded-lg border object-contain" />;
}

// One reported payment: client, services, time, amount due, and what the client reported, with the
// difference highlighted (app flow §6). Asking to resubmit or rejecting needs a note for the client.
export function DepositReviewSheet({
  booking,
  timeZone,
  onClose,
}: {
  booking: DepositBooking;
  timeZone: string;
  onClose: () => void;
}) {
  const [pendingDecision, setPendingDecision] = useState<Exclude<Decision, "accepted"> | null>(null);
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const proof = booking.proof;
  const isFlagged = booking.status === "review_expired_pending_resolution";
  const difference = proof ? Math.round((proof.amountPaid - booking.amountDue) * 100) / 100 : 0;

  const decide = useMutation({
    mutationFn: async (decision: Decision) => {
      if (!proof) throw new Error("The booking has no payment report.");
      const { error } = await supabase.rpc("review_payment_proof", {
        p_proof_id: proof.id,
        p_outcome: decision,
        p_review_note: decision === "accepted" ? undefined : note.trim(),
      });
      if (error) throw error;
      return decision;
    },
    onSuccess: (decision) => {
      toast.success(decisionToasts[decision]);
      onClose();
    },
  });

  const confirmWithNote = () => {
    if (!pendingDecision) return;
    if (!note.trim()) {
      setNoteMissing(true);
      return;
    }
    decide.mutate(pendingDecision);
  };

  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.deposits.reviewTitle} description={booking.clientName}>
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2">
          <div className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{messages.booking.services}</dt>
            <dd>
              {booking.serviceNames.join(", ")}
              {booking.staffName ? ` · ${booking.staffName}` : ""}
            </dd>
          </div>
          {booking.startAt ? (
            <div className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{messages.booking.when}</dt>
              <dd className="tabular-nums">{formatDateTime(booking.startAt, timeZone)}</dd>
            </div>
          ) : null}
        </dl>
        {proof ? (
          <>
            <dl className="flex flex-col gap-2 rounded-xl border p-4">
              <AmountRow label={messages.deposits.amountDue} amount={booking.amountDue} />
              <AmountRow label={messages.deposits.reported} amount={proof.amountPaid} />
              {difference !== 0 ? (
                <p role="status" className={cn("rounded-lg px-3 py-2 text-sm font-medium", "bg-danger-surface text-danger")}>
                  {fillTemplate(difference < 0 ? messages.deposits.difference : messages.deposits.overpaid, {
                    amount: formatPeso(Math.abs(difference)),
                  })}
                </p>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{messages.deposits.reference}</dt>
                <dd className="font-medium tabular-nums">{proof.referenceNumber}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{messages.deposits.method}</dt>
                <dd>{messages.paymentMethods[proof.method]}</dd>
              </div>
              {proof.note ? (
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">{messages.deposits.clientNote}</dt>
                  <dd>{proof.note}</dd>
                </div>
              ) : null}
            </dl>
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{messages.deposits.screenshot}</h3>
              {proof.proofPath ? (
                <ProofScreenshot path={proof.proofPath} />
              ) : (
                <p className="text-sm text-muted-foreground">{messages.deposits.noScreenshot}</p>
              )}
            </section>
          </>
        ) : null}

        {isFlagged ? <p className="text-sm text-muted-foreground">{messages.deposits.flaggedOnly}</p> : null}
        {pendingDecision ? (
          <TextField
            id="review-note"
            label={messages.deposits.noteToClient}
            value={note}
            errors={noteMissing && !note.trim() ? [pendingDecision === "rejected" ? messages.deposits.reasonRequired : messages.deposits.noteRequired] : []}
            onChange={setNote}
            onBlur={() => undefined}
          />
        ) : null}
        <FormErrorAlert error={decide.error} />
        <div className="flex flex-col gap-3">
          {pendingDecision ? (
            <>
              <Button
                variant={pendingDecision === "rejected" ? "destructive" : "default"}
                disabled={decide.isPending}
                onClick={confirmWithNote}
              >
                {pendingDecision === "rejected" ? messages.deposits.reject : messages.deposits.requestResubmission}
              </Button>
              <Button variant="outline" onClick={() => setPendingDecision(null)}>
                {messages.setup.cancel}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{messages.deposits.acceptHint}</p>
              <Button disabled={decide.isPending || !proof} onClick={() => decide.mutate("accepted")}>
                {messages.deposits.accept}
              </Button>
              {isFlagged ? null : (
                <Button variant="outline" onClick={() => setPendingDecision("resubmission_requested")}>
                  {messages.deposits.requestResubmission}
                </Button>
              )}
              <Button variant="outline" className="text-danger" onClick={() => setPendingDecision("rejected")}>
                {messages.deposits.reject}
              </Button>
            </>
          )}
        </div>
      </div>
    </TaskSheet>
  );
}
