import { queryOptions } from "@tanstack/react-query";
import type { PaymentMethod } from "@/features/booking/booking-link-queries";
import { visitsQueryKey } from "@/features/floor/visit-queries";
import { supabase } from "@/lib/supabase-client";
import type { Json } from "@/types/database.types";

export type DailyCloseStaffLine = {
  staffId: string;
  displayName: string;
  serviceRevenue: number;
  commissionAmount: number;
  tipAmount: number;
  visitCount: number;
};

export type DailyCloseSummary = {
  grossSales: number;
  discounts: number;
  tips: number;
  depositsApplied: number;
  depositsReceived: number;
  feesCollected: number;
  cashSales: number;
  totalsByMethod: { method: PaymentMethod; amount: number }[];
  staff: DailyCloseStaffLine[];
  saleCount: number;
  unfinishedVisitCount: number;
  isClosed: boolean;
  cashFloat: number | null;
  cashExpected: number | null;
  cashCounted: number | null;
  cashVariance: number | null;
  closedAt: string | null;
};

const paymentMethods: readonly PaymentMethod[] = ["cash", "gcash", "maya", "card", "bank_transfer", "other"];

function readTotalsByMethod(value: Json): DailyCloseSummary["totalsByMethod"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return paymentMethods.flatMap((method) => {
    const amount = value[method];
    return typeof amount === "number" ? [{ method, amount }] : [];
  });
}

function readStaff(value: Json): DailyCloseStaffLine[] {
  if (!Array.isArray(value)) throw new Error("get_daily_close_summary.staff is not an array.");
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error("Unexpected staff line.");
    return {
      staffId: String(entry.staff_id),
      displayName: String(entry.display_name),
      serviceRevenue: Number(entry.service_revenue),
      commissionAmount: Number(entry.commission_amount),
      tipAmount: Number(entry.tip_amount),
      visitCount: Number(entry.visit_count),
    };
  });
}

// The branch's totals for a business date: the stored close when the day is closed, otherwise
// the running totals, from the database (get_daily_close_summary).
export function dailyCloseSummaryQueryOptions(branchId: string, businessDate: string) {
  return queryOptions({
    queryKey: [...visitsQueryKey(branchId), "daily-close", businessDate] as const,
    queryFn: async (): Promise<DailyCloseSummary> => {
      const { data, error } = await supabase.rpc("get_daily_close_summary", { p_branch_id: branchId, p_business_date: businessDate });
      if (error) throw error;
      const row = data[0];
      if (!row) throw new Error("get_daily_close_summary returned no row.");
      return {
        grossSales: row.gross_sales,
        discounts: row.discounts,
        tips: row.tips,
        depositsApplied: row.deposits_applied,
        depositsReceived: row.deposits_received,
        feesCollected: row.fees_collected,
        cashSales: row.cash_sales,
        totalsByMethod: readTotalsByMethod(row.totals_by_method),
        staff: readStaff(row.staff),
        saleCount: row.sale_count,
        unfinishedVisitCount: row.unfinished_visit_count,
        isClosed: row.is_closed,
        cashFloat: row.cash_float,
        cashExpected: row.cash_expected,
        cashCounted: row.cash_counted,
        cashVariance: row.cash_variance,
        closedAt: row.closed_at,
      };
    },
  });
}
