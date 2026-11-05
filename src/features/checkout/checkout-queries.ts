import { queryOptions } from "@tanstack/react-query";
import type { PaymentMethod } from "@/features/booking/booking-link-queries";
import { readVisit, visitsQueryKey, type Visit } from "@/features/floor/visit-queries";
import { supabase } from "@/lib/supabase-client";
import type { Json } from "@/types/database.types";

export type VisitService = { serviceId: string; name: string; price: number };
export type RefundOutcome = { refunded: boolean; amount: number };

// One visit with what checkout needs: its services at their booked prices and the deposit paid.
export type VisitDetail = Visit & { depositAmount: number; services: VisitService[]; refund: RefundOutcome | null };

export type SaleDetail = {
  id: string;
  subtotal: number;
  discountAmount: number;
  tipAmount: number;
  depositApplied: number;
  balanceCollected: number;
  items: { description: string; staffName: string; amount: number; discountShare: number; commissionAmount: number }[];
  tips: { staffName: string; amount: number }[];
  payments: { method: PaymentMethod; amount: number; reference: string | null }[];
};

function readRefund(value: Json | null): RefundOutcome | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const amount = Number(value.amount ?? 0);
  return { refunded: value.outcome === "refunded", amount: Number.isFinite(amount) ? amount : 0 };
}

export function visitDetailQueryOptions(branchId: string, bookingId: string) {
  return queryOptions({
    queryKey: [...visitsQueryKey(branchId), "detail", bookingId] as const,
    queryFn: async (): Promise<VisitDetail | null> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, booking_code, status, source, business_date, start_at, end_at, queue_number, staff_id, hold_expires_at, client_note, deposit_amount, refund_metadata, staff(display_name), clients(full_name), booking_services(service_id, service_name, sort_order, price)",
        )
        .eq("id", bookingId)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...readVisit(data),
        depositAmount: data.deposit_amount,
        refund: readRefund(data.refund_metadata),
        services: [...data.booking_services]
          .sort((first, second) => first.sort_order - second.sort_order)
          .map((service) => ({ serviceId: service.service_id, name: service.service_name, price: service.price })),
      };
    },
  });
}

// The sale of a checked-out visit, for the visit page's summary.
export function saleQueryOptions(branchId: string, bookingId: string) {
  return queryOptions({
    queryKey: [...visitsQueryKey(branchId), "sale", bookingId] as const,
    queryFn: async (): Promise<SaleDetail | null> => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, subtotal, discount_amount, tip_amount, deposit_applied, balance_collected, sale_items(description, amount, discount_share, commission_amount, sort_order, staff(display_name)), sale_tips(amount, staff(display_name)), sale_payments(method, amount, reference)",
        )
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        subtotal: data.subtotal,
        discountAmount: data.discount_amount,
        tipAmount: data.tip_amount,
        depositApplied: data.deposit_applied,
        balanceCollected: data.balance_collected,
        items: [...data.sale_items]
          .sort((first, second) => first.sort_order - second.sort_order)
          .map((item) => ({
            description: item.description,
            staffName: item.staff?.display_name ?? "",
            amount: item.amount,
            discountShare: item.discount_share,
            commissionAmount: item.commission_amount,
          })),
        tips: data.sale_tips.map((tip) => ({ staffName: tip.staff?.display_name ?? "", amount: tip.amount })),
        payments: data.sale_payments.map((payment) => ({ method: payment.method, amount: payment.amount, reference: payment.reference })),
      };
    },
  });
}
