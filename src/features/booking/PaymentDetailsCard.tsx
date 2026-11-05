import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BookingPaymentDetails } from "@/features/booking/booking-link-queries";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";
import { publicImageUrl } from "@/lib/stored-images";

const methodLabels: Record<string, string> = messages.branches.methods;

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-medium tabular-nums">{display ?? value}</dd>
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label={fillTemplate(messages.bookingPage.copy, { label: label.toLowerCase() })}
        onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success(messages.bookingPage.copied))}
      >
        <Copy aria-hidden />
      </Button>
    </div>
  );
}

// Method, account name, and number with a copy button, then the QR image, then the amount with a
// copy button (design brief §5). These are the details snapshotted when the slot was held.
export function PaymentDetailsCard({ details, amountDue }: { details: BookingPaymentDetails; amountDue: number }) {
  return (
    <section aria-labelledby="payment-details-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <h2 id="payment-details-heading" className="text-lg font-medium">
        {messages.bookingPage.paymentDetails}: {methodLabels[details.method] ?? details.method}
      </h2>
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col">
          <dt className="text-sm text-muted-foreground">{messages.bookingPage.accountName}</dt>
          <dd className="font-medium">{details.accountName}</dd>
        </div>
        <CopyRow label={messages.bookingPage.accountNumber} value={details.accountNumber} />
      </dl>
      <img
        src={publicImageUrl("payment-qr", details.qrPath)}
        alt={messages.bookingPage.qrImage}
        className="mx-auto size-56 rounded-lg border object-contain"
      />
      <dl>
        <CopyRow label={messages.bookingPage.amount} value={amountDue.toFixed(2)} display={formatPeso(amountDue)} />
      </dl>
    </section>
  );
}
