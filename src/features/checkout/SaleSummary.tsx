import { AmountRow } from "@/components/AmountRow";
import type { SaleDetail } from "@/features/checkout/checkout-queries";
import { messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

// A checked-out visit's sale: items with their staff, discount shares, and commission; tips;
// the deposit applied; and the payments collected.
export function SaleSummary({ sale }: { sale: SaleDetail }) {
  return (
    <section aria-labelledby="sale-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <h2 id="sale-heading" className="text-xl font-semibold">
        {messages.visit.saleTitle}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{messages.visit.item}</th>
              <th className="py-2 pr-3 font-medium">{messages.visit.staff}</th>
              <th className="py-2 pr-3 text-right font-medium">{messages.visit.price}</th>
              <th className="py-2 text-right font-medium">{messages.visit.commission}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sale.items.map((item, index) => (
              <tr key={index}>
                <td className="py-2 pr-3">{item.description}</td>
                <td className="py-2 pr-3">{item.staffName}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(item.amount)}</td>
                <td className="py-2 text-right tabular-nums">{formatPeso(item.commissionAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="flex flex-col gap-2">
        <AmountRow label={messages.visit.subtotal} amount={sale.subtotal} />
        {sale.discountAmount > 0 ? <AmountRow label={messages.visit.discountLine} amount={-sale.discountAmount} /> : null}
        {sale.tips.map((tip) => (
          <AmountRow key={tip.staffName} label={`${messages.visit.tips}: ${tip.staffName}`} amount={tip.amount} />
        ))}
        {sale.depositApplied > 0 ? <AmountRow label={messages.visit.depositPaid} amount={-sale.depositApplied} /> : null}
        <AmountRow label={messages.visit.collected} amount={sale.balanceCollected} emphasis />
        {sale.payments.map((payment, index) => (
          <AmountRow
            key={index}
            label={payment.reference ? `${messages.paymentMethods[payment.method]} · ${payment.reference}` : messages.paymentMethods[payment.method]}
            amount={payment.amount}
          />
        ))}
      </dl>
    </section>
  );
}
