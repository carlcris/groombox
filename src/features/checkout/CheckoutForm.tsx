import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AmountRow } from "@/components/AmountRow";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { FormField } from "@/components/FormField";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaymentMethod } from "@/features/booking/booking-link-queries";
import { branchStaffQueryOptions } from "@/features/branch-setup/branch-setup-queries";
import { checkoutTotals, parseAmount, toCentavos } from "@/features/checkout/checkout-totals";
import type { VisitDetail } from "@/features/checkout/checkout-queries";
import { StaffSelectField } from "@/features/floor/StaffSelectField";
import { visitsQueryKey } from "@/features/floor/visit-queries";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";
import { amountText, optional } from "@/lib/number-field-schemas";
import { supabase } from "@/lib/supabase-client";

const checkoutMethods = ["cash", "gcash", "maya", "card", "bank_transfer", "other"] as const satisfies readonly PaymentMethod[];

const checkoutSchema = z
  .object({
    items: z
      .array(
        z.object({
          serviceId: z.string().nullable(),
          description: z.string().trim().min(1, { error: messages.validation.required }),
          staffId: z.string().nullable().refine((staffId) => staffId !== null, { error: messages.floor.chooseStaff }),
          amount: amountText({ allowZero: true }),
        }),
      )
      .min(1, { error: messages.validation.required }),
    discount: optional(amountText({ allowZero: true })),
    tips: z.record(z.string(), optional(amountText({ allowZero: true }))),
    payments: z.array(
      z.object({ method: z.enum(checkoutMethods), amount: amountText({ allowZero: false }), reference: z.string(), cashReceived: z.string() }),
    ),
  })
  .superRefine((value, context) => {
    const subtotal = value.items.reduce((sum, item) => sum + toCentavos(parseAmount(item.amount)), 0);
    if (toCentavos(parseAmount(value.discount)) > subtotal) {
      context.addIssue({ code: "custom", path: ["discount"], message: messages.visit.discountTooLarge });
    }
  });

type CheckoutValues = z.input<typeof checkoutSchema>;

function staffOnSale(values: CheckoutValues): string[] {
  return [...new Set(values.items.flatMap((item) => (item.staffId ? [item.staffId] : [])))];
}

function totalsFor(values: CheckoutValues, deposit: number) {
  return checkoutTotals(
    values.items.map((item) => parseAmount(item.amount)),
    parseAmount(values.discount),
    staffOnSale(values).map((staffId) => parseAmount(values.tips[staffId] ?? "")),
    deposit,
  );
}

// Checkout: the booking's services pre-filled, prices adjustable, extra items, a discount, a tip for
// each staff member on the sale, and payments that must add up to the balance exactly (app flow §8).
export function CheckoutForm({ branchId, visit, onCompleted }: { branchId: string; visit: VisitDetail; onCompleted: () => void }) {
  const queryClient = useQueryClient();
  const staff = useQuery(branchStaffQueryOptions(branchId));
  const staffName = (staffId: string) => staff.data?.find((member) => member.id === staffId)?.displayName ?? "";
  const complete = useMutation({
    mutationFn: async (values: CheckoutValues) => {
      const onSale = staffOnSale(values);
      const { error } = await supabase.rpc("complete_checkout", {
        p_booking_id: visit.id,
        p_items: values.items.map((item) => ({
          service_id: item.serviceId,
          description: item.description.trim(),
          staff_id: item.staffId,
          amount: parseAmount(item.amount),
        })),
        p_discount_amount: parseAmount(values.discount),
        p_tips: onSale
          .map((staffId) => ({ staff_id: staffId, amount: parseAmount(values.tips[staffId] ?? "") }))
          .filter((tip) => tip.amount > 0),
        p_payments: values.payments.map((payment) => ({
          method: payment.method,
          amount: parseAmount(payment.amount),
          reference: payment.reference.trim() || null,
        })),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: visitsQueryKey(branchId) });
      toast.success(messages.visit.completed);
      onCompleted();
    },
  });
  const form = useForm({
    defaultValues: {
      items: visit.services.map((service) => ({
        serviceId: service.serviceId as string | null,
        description: service.name,
        staffId: visit.staffId,
        amount: service.price.toFixed(2),
      })),
      discount: "",
      tips: {} as Record<string, string>,
      payments: [] as CheckoutValues["payments"],
    } satisfies CheckoutValues,
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: checkoutSchema },
    onSubmit: async ({ value }) => {
      await complete.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <section aria-labelledby="checkout-items" className="flex flex-col gap-3">
        <h2 id="checkout-items" className="text-xl font-semibold">
          {messages.visit.items}
        </h2>
        <form.Field name="items" mode="array">
          {(itemsField) => (
            <>
              <ul className="flex flex-col gap-3">
                {itemsField.state.value.map((item, index) => (
                  <li key={index} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm" aria-label={item.description || messages.visit.item}>
                    <form.Field name={`items[${index}].description`}>
                      {(field) => (
                        <TextField
                          id={`item-${index}-description`}
                          label={messages.visit.description}
                          value={field.state.value}
                          errors={field.state.meta.errors}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <form.Field name={`items[${index}].staffId`}>
                        {(field) => (
                          <StaffSelectField
                            id={`item-${index}-staff`}
                            label={messages.visit.staff}
                            staff={staff.data ?? []}
                            value={field.state.value}
                            error={field.state.meta.errors.length > 0 ? messages.floor.chooseStaff : undefined}
                            onChange={field.handleChange}
                          />
                        )}
                      </form.Field>
                      <form.Field name={`items[${index}].amount`}>
                        {(field) => (
                          <TextField
                            id={`item-${index}-amount`}
                            label={messages.visit.price}
                            type="number"
                            value={field.state.value}
                            errors={field.state.meta.errors}
                            onChange={field.handleChange}
                            onBlur={field.handleBlur}
                          />
                        )}
                      </form.Field>
                    </div>
                    {itemsField.state.value.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="self-start text-danger"
                        onClick={() => itemsField.removeValue(index)}
                      >
                        <Trash2 aria-hidden />
                        {fillTemplate(messages.visit.removeItem, { item: item.description || messages.visit.item })}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => itemsField.pushValue({ serviceId: null, description: messages.visit.newItem, staffId: visit.staffId, amount: "" })}
              >
                <Plus aria-hidden />
                {messages.visit.addItem}
              </Button>
            </>
          )}
        </form.Field>
      </section>

      <form.Field name="discount">
        {(field) => (
          <TextField
            id="checkout-discount"
            label={messages.visit.discount}
            type="number"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => staffOnSale(state.values)}>
        {(onSale) => (
          <section aria-labelledby="checkout-tips" className="flex flex-col gap-3">
            <h2 id="checkout-tips" className="text-xl font-semibold">
              {messages.visit.tips}
            </h2>
            {onSale.map((staffId) => (
              <form.Field key={staffId} name={`tips.${staffId}`}>
                {(field) => (
                  <TextField
                    id={`tip-${staffId}`}
                    label={fillTemplate(messages.visit.tipFor, { name: staffName(staffId) })}
                    type="number"
                    value={field.state.value ?? ""}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            ))}
          </section>
        )}
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const totals = totalsFor(values, visit.depositAmount);
          const paid = values.payments.reduce((sum, payment) => sum + toCentavos(parseAmount(payment.amount)), 0);
          const difference = toCentavos(totals.balance) - paid;
          return (
            <>
              <dl className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
                <AmountRow label={messages.visit.subtotal} amount={totals.subtotal} />
                {totals.discount > 0 ? <AmountRow label={messages.visit.discountLine} amount={-totals.discount} /> : null}
                {totals.tips > 0 ? <AmountRow label={messages.visit.tips} amount={totals.tips} /> : null}
                <AmountRow label={messages.visit.total} amount={totals.total} />
                {visit.depositAmount > 0 ? <AmountRow label={messages.visit.depositPaid} amount={-totals.depositApplied} /> : null}
                <AmountRow label={messages.visit.balance} amount={totals.balance} emphasis />
                {totals.refundDue > 0 ? (
                  <p role="status" className="rounded-lg bg-warning-surface px-3 py-2 text-sm font-medium text-warning">
                    {fillTemplate(messages.visit.refundDue, { amount: formatPeso(totals.refundDue) })}
                  </p>
                ) : null}
              </dl>

              <section aria-labelledby="checkout-payments" className="flex flex-col gap-3">
                <h2 id="checkout-payments" className="text-xl font-semibold">
                  {messages.visit.payments}
                </h2>
                <form.Field name="payments" mode="array">
                  {(paymentsField) => (
                    <>
                      <ul className="flex flex-col gap-3">
                        {paymentsField.state.value.map((payment, index) => {
                          const change = parseAmount(payment.cashReceived) - parseAmount(payment.amount);
                          return (
                            <li key={index} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
                              <div className="grid gap-3 md:grid-cols-2">
                                <form.Field name={`payments[${index}].method`}>
                                  {(field) => (
                                    <FormField id={`payment-${index}-method`} label={messages.visit.paymentMethod}>
                                      <Select value={field.state.value} onValueChange={(method) => field.handleChange(method as PaymentMethod & (typeof checkoutMethods)[number])}>
                                        <SelectTrigger id={`payment-${index}-method`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {checkoutMethods.map((method) => (
                                            <SelectItem key={method} value={method} className="min-h-11 text-base">
                                              {messages.paymentMethods[method]}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormField>
                                  )}
                                </form.Field>
                                <form.Field name={`payments[${index}].amount`}>
                                  {(field) => (
                                    <TextField
                                      id={`payment-${index}-amount`}
                                      label={messages.visit.paymentAmount}
                                      type="number"
                                      value={field.state.value}
                                      errors={field.state.meta.errors}
                                      onChange={field.handleChange}
                                      onBlur={field.handleBlur}
                                    />
                                  )}
                                </form.Field>
                              </div>
                              {payment.method === "cash" ? (
                                <form.Field name={`payments[${index}].cashReceived`}>
                                  {(field) => (
                                    <TextField
                                      id={`payment-${index}-received`}
                                      label={messages.visit.cashReceived}
                                      type="number"
                                      value={field.state.value}
                                      errors={[]}
                                      onChange={field.handleChange}
                                      onBlur={field.handleBlur}
                                    />
                                  )}
                                </form.Field>
                              ) : (
                                <form.Field name={`payments[${index}].reference`}>
                                  {(field) => (
                                    <TextField
                                      id={`payment-${index}-reference`}
                                      label={messages.visit.reference}
                                      value={field.state.value}
                                      errors={[]}
                                      onChange={field.handleChange}
                                      onBlur={field.handleBlur}
                                    />
                                  )}
                                </form.Field>
                              )}
                              {payment.method === "cash" && change > 0 ? (
                                <p className="font-medium tabular-nums">{fillTemplate(messages.visit.change, { amount: formatPeso(change) })}</p>
                              ) : null}
                              <Button type="button" variant="ghost" className="self-start text-danger" onClick={() => paymentsField.removeValue(index)}>
                                <Trash2 aria-hidden />
                                {messages.visit.removePayment}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                      {difference > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="self-start"
                          onClick={() =>
                            paymentsField.pushValue({
                              method: paymentsField.state.value.length === 0 ? "cash" : "gcash",
                              amount: (difference / 100).toFixed(2),
                              reference: "",
                              cashReceived: "",
                            })
                          }
                        >
                          <Plus aria-hidden />
                          {messages.visit.addPayment}
                        </Button>
                      ) : null}
                    </>
                  )}
                </form.Field>
                <p role="status" className={difference === 0 ? "text-success" : "text-warning"}>
                  {totals.balance === 0 && paid === 0
                    ? messages.visit.nothingToCollect
                    : difference === 0
                      ? messages.visit.paidInFull
                      : difference > 0
                        ? fillTemplate(messages.visit.remaining, { amount: formatPeso(difference / 100) })
                        : fillTemplate(messages.visit.over, { amount: formatPeso(-difference / 100) })}
                </p>
              </section>

              <FormErrorAlert error={complete.error} />
              <Button type="submit" disabled={difference !== 0 || complete.isPending}>
                {messages.visit.complete}
              </Button>
            </>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
