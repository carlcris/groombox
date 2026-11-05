import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { LockKeyhole, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AmountRow } from "@/components/AmountRow";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dailyCloseSummaryQueryOptions, type DailyCloseSummary } from "@/features/checkout/daily-close-queries";
import { parseAmount, toCentavos } from "@/features/checkout/checkout-totals";
import { useVisitUpdates } from "@/features/floor/useVisitUpdates";
import { branchTodayQueryOptions, visitsQueryKey } from "@/features/floor/visit-queries";
import { formatDateTime } from "@/lib/date-formatting";
import { firstFieldError } from "@/components/FormField";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";
import { amountText } from "@/lib/number-field-schemas";
import { supabase } from "@/lib/supabase-client";

// The daily close for a branch's business date, for owners and managers (app flow §9). The business
// date defaults to the current one, so a spa closing at 2:00 AM closes the day it opened.
const closeSearchSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined) });

export const Route = createFileRoute("/shop/$branchId/close")({
  validateSearch: closeSearchSchema,
  beforeLoad: ({ context, params }) => {
    if (context.currentMembership.role === "staff") {
      throw redirect({ to: "/shop/$branchId/floor", params: { branchId: params.branchId } });
    }
  },
  component: DailyClosePage,
});

const cashSchema = amountText({ allowZero: true });

function BigNumber({ label, amount, hint }: { label: string; amount: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-heading text-3xl font-semibold tabular-nums">{formatPeso(amount)}</dd>
      {hint ? <dd className="text-sm text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function CloseTotals({ summary }: { summary: DailyCloseSummary }) {
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BigNumber label={messages.dailyClose.grossSales} amount={summary.grossSales} />
        <BigNumber label={messages.dailyClose.depositsReceived} amount={summary.depositsReceived} />
        <BigNumber label={messages.dailyClose.feesCollected} amount={summary.feesCollected} hint={messages.dailyClose.feesHint} />
      </dl>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="by-method" className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <h2 id="by-method" className="text-lg font-medium">
            {messages.dailyClose.byMethod}
          </h2>
          {summary.totalsByMethod.length === 0 ? (
            <p className="text-muted-foreground">{messages.dailyClose.noSales}</p>
          ) : (
            <dl className="flex flex-col gap-2">
              {summary.totalsByMethod.map((line) => (
                <AmountRow key={line.method} label={messages.paymentMethods[line.method]} amount={line.amount} />
              ))}
            </dl>
          )}
        </section>
        <dl className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <AmountRow label={messages.dailyClose.discounts} amount={summary.discounts} />
          <AmountRow label={messages.dailyClose.tips} amount={summary.tips} />
          <AmountRow label={messages.dailyClose.depositsApplied} amount={summary.depositsApplied} />
        </dl>
      </div>
      {summary.staff.length > 0 ? (
        <section aria-labelledby="close-staff" className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <h2 id="close-staff" className="text-lg font-medium">
            {messages.dailyClose.staffTitle}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{messages.dailyClose.staffName}</th>
                  <th className="py-2 pr-3 text-right font-medium">{messages.dailyClose.revenue}</th>
                  <th className="py-2 pr-3 text-right font-medium">{messages.dailyClose.commission}</th>
                  <th className="py-2 pr-3 text-right font-medium">{messages.dailyClose.staffTips}</th>
                  <th className="py-2 text-right font-medium">{messages.dailyClose.visits}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.staff.map((line) => (
                  <tr key={line.staffId}>
                    <td className="py-2 pr-3">{line.displayName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(line.serviceRevenue)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(line.commissionAmount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(line.tipAmount)}</td>
                    <td className="py-2 text-right tabular-nums">{line.visitCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function DailyClosePage() {
  const { branch, currentMembership } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  useVisitUpdates(branch.id);
  const today = useQuery(branchTodayQueryOptions(branch.id));
  const businessDate = search.date ?? today.data ?? "";
  const summary = useQuery({ ...dailyCloseSummaryQueryOptions(branch.id, businessDate), enabled: businessDate !== "" });
  const [cashFloat, setCashFloat] = useState("0");
  const [cashCounted, setCashCounted] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: visitsQueryKey(branch.id) });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("close_day", {
        p_branch_id: branch.id,
        p_business_date: businessDate,
        p_cash_float: parseAmount(cashFloat),
        p_cash_counted: parseAmount(cashCounted),
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.dailyClose.closed),
    onSettled: refresh,
  });
  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reopen_day", { p_branch_id: branch.id, p_business_date: businessDate });
      if (error) throw error;
    },
    onSuccess: () => toast.success(messages.dailyClose.reopened),
    onSettled: refresh,
  });

  const floatError = showErrors ? firstFieldError(cashSchema.safeParse(cashFloat).error?.issues ?? []) : undefined;
  const countedError = showErrors ? firstFieldError(cashSchema.safeParse(cashCounted).error?.issues ?? []) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <PageHeading>{messages.dailyClose.title}</PageHeading>
          <p className="text-muted-foreground">{branch.name}</p>
        </div>
        <div className="max-w-xs">
          <TextField
            id="close-date"
            label={messages.dailyClose.businessDate}
            type="date"
            value={businessDate}
            errors={[]}
            onChange={(date) => void navigate({ search: { date: date || undefined }, replace: true })}
            onBlur={() => undefined}
          />
        </div>
      </div>

      {summary.isError ? (
        <QueryErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : !summary.data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          {summary.data.isClosed ? (
            <p role="status" className="flex items-center gap-2 rounded-xl border bg-success-surface p-4 text-success">
              <LockKeyhole className="size-5" aria-hidden />
              {summary.data.closedAt
                ? fillTemplate(messages.dailyClose.closedAt, { time: formatDateTime(summary.data.closedAt, branch.timezone) })
                : messages.dailyClose.closed}
            </p>
          ) : summary.data.unfinishedVisitCount > 0 ? (
            <div role="alert" className="flex flex-col gap-2 rounded-xl border bg-warning-surface p-4 text-warning md:flex-row md:items-center md:justify-between">
              <p className="flex items-center gap-2">
                <TriangleAlert className="size-5" aria-hidden />
                {fillTemplate(messages.dailyClose.unfinished, { count: String(summary.data.unfinishedVisitCount) })}
              </p>
              <Button asChild variant="outline">
                <Link to="/shop/$branchId/floor" params={{ branchId: branch.id }}>
                  {messages.dailyClose.goToFloor}
                </Link>
              </Button>
            </div>
          ) : null}

          <CloseTotals summary={summary.data} />

          <section aria-labelledby="cash-drawer" className="flex max-w-xl flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
            <h2 id="cash-drawer" className="text-lg font-medium">
              {messages.dailyClose.cashTitle}
            </h2>
            {summary.data.isClosed ? (
              <dl className="flex flex-col gap-2">
                <AmountRow label={messages.dailyClose.cashFloatLine} amount={summary.data.cashFloat ?? 0} />
                <AmountRow label={messages.dailyClose.cashSales} amount={summary.data.cashSales} />
                <AmountRow label={messages.dailyClose.cashExpected} amount={summary.data.cashExpected ?? 0} />
                <AmountRow label={messages.dailyClose.cashCountedLine} amount={summary.data.cashCounted ?? 0} />
                <AmountRow label={messages.dailyClose.variance} amount={summary.data.cashVariance ?? 0} emphasis />
              </dl>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="cash-float"
                    label={messages.dailyClose.cashFloat}
                    type="number"
                    value={cashFloat}
                    errors={floatError ? [floatError] : []}
                    onChange={setCashFloat}
                    onBlur={() => undefined}
                  />
                  <TextField
                    id="cash-counted"
                    label={messages.dailyClose.cashCounted}
                    type="number"
                    value={cashCounted}
                    errors={countedError ? [countedError] : []}
                    onChange={setCashCounted}
                    onBlur={() => undefined}
                  />
                </div>
                <dl className="flex flex-col gap-2">
                  <AmountRow label={messages.dailyClose.cashSales} amount={summary.data.cashSales} />
                  <AmountRow label={messages.dailyClose.cashExpected} amount={(toCentavos(parseAmount(cashFloat)) + toCentavos(summary.data.cashSales)) / 100} />
                  <AmountRow
                    label={messages.dailyClose.variance}
                    amount={(toCentavos(parseAmount(cashCounted)) - toCentavos(parseAmount(cashFloat)) - toCentavos(summary.data.cashSales)) / 100}
                    emphasis
                  />
                </dl>
              </>
            )}
          </section>

          <FormErrorAlert error={close.error ?? reopen.error} />
          {summary.data.isClosed ? (
            currentMembership.role === "owner" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{messages.dailyClose.reopenHint}</p>
                <Button variant="outline" className="self-start" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
                  {messages.dailyClose.reopen}
                </Button>
              </div>
            ) : null
          ) : (
            <Button
              className="self-start"
              disabled={close.isPending || summary.data.unfinishedVisitCount > 0}
              onClick={() => {
                setShowErrors(true);
                if (cashSchema.safeParse(cashFloat).success && cashSchema.safeParse(cashCounted).success) close.mutate();
              }}
            >
              {messages.dailyClose.close}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
