import { queryOptions } from "@tanstack/react-query";
import type { BookingStatus, PaymentMethod, ProofStatus } from "@/features/booking/booking-link-queries";
import { supabase } from "@/lib/supabase-client";

export type ReviewedProof = {
  id: string;
  referenceNumber: string;
  amountPaid: number;
  method: PaymentMethod;
  proofPath: string | null;
  note: string | null;
  status: ProofStatus;
  createdAt: string;
  reviewedAt: string | null;
};

export type DepositBooking = {
  id: string;
  bookingCode: string;
  status: BookingStatus;
  startAt: string | null;
  amountDue: number;
  depositAmount: number;
  reviewExpiresAt: string | null;
  clientName: string;
  staffName: string | null;
  serviceNames: string[];
  proof: ReviewedProof | null;
};

export type DepositPage = { bookings: DepositBooking[]; totalCount: number };

export const depositPageSize = 20;

// Bookings with a reported payment and a decision due, flagged ones first, then by review deadline.
const toReviewStatuses = ["payment_submitted", "review_expired_pending_resolution"] as const satisfies readonly BookingStatus[];
const refundStatuses = ["cancelled", "payment_rejected", "no_show"] as const satisfies readonly BookingStatus[];
// A refund applies once the client reported paying, whatever became of the report.
const reportedProofStatuses = ["accepted", "rejected", "withdrawn", "submitted"] as const satisfies readonly ProofStatus[];

export type DepositList = "to_review" | "waiting_for_client" | "refunds";

export function depositsQueryKey(branchId: string) {
  return ["deposits", branchId] as const;
}

function readRow(row: {
  id: string;
  booking_code: string;
  status: BookingStatus;
  start_at: string | null;
  amount_due: number;
  deposit_amount: number;
  review_expires_at: string | null;
  clients: { full_name: string } | null;
  staff: { display_name: string } | null;
  booking_services: { service_name: string; sort_order: number }[];
  payment_proofs: {
    id: string;
    reference_number: string;
    amount_paid: number;
    method: PaymentMethod;
    proof_path: string | null;
    note: string | null;
    status: ProofStatus;
    created_at: string;
    reviewed_at: string | null;
  }[];
}): DepositBooking {
  const proof = row.payment_proofs[0];
  return {
    id: row.id,
    bookingCode: row.booking_code,
    status: row.status,
    startAt: row.start_at,
    amountDue: row.amount_due,
    depositAmount: row.deposit_amount,
    reviewExpiresAt: row.review_expires_at,
    clientName: row.clients?.full_name ?? "",
    staffName: row.staff?.display_name ?? null,
    serviceNames: [...row.booking_services].sort((a, b) => a.sort_order - b.sort_order).map((service) => service.service_name),
    proof: proof
      ? {
          id: proof.id,
          referenceNumber: proof.reference_number,
          amountPaid: proof.amount_paid,
          method: proof.method,
          proofPath: proof.proof_path,
          note: proof.note,
          status: proof.status,
          createdAt: proof.created_at,
          reviewedAt: proof.reviewed_at,
        }
      : null,
  };
}

export function depositListQueryOptions(branchId: string, list: DepositList, page: number) {
  return queryOptions({
    queryKey: [...depositsQueryKey(branchId), list, page] as const,
    queryFn: async (): Promise<DepositPage> => {
      const from = page * depositPageSize;
      // Refunds list only bookings with a reported payment, so their proofs are an inner join.
      const columns =
        list === "refunds"
          ? supabase
              .from("bookings")
              .select(
                "id, booking_code, status, start_at, amount_due, deposit_amount, review_expires_at, clients(full_name), staff(display_name), booking_services(service_name, sort_order), payment_proofs!inner(id, reference_number, amount_paid, method, proof_path, note, status, created_at, reviewed_at)",
                { count: "exact" },
              )
          : supabase
              .from("bookings")
              .select(
                "id, booking_code, status, start_at, amount_due, deposit_amount, review_expires_at, clients(full_name), staff(display_name), booking_services(service_name, sort_order), payment_proofs(id, reference_number, amount_paid, method, proof_path, note, status, created_at, reviewed_at)",
                { count: "exact" },
              );
      let query = columns
        .eq("branch_id", branchId)
        .order("created_at", { referencedTable: "payment_proofs", ascending: false })
        .limit(1, { referencedTable: "payment_proofs" });
      if (list === "to_review") {
        // review_expired_pending_resolution comes after payment_submitted in the enum, so a
        // descending sort puts flagged bookings first.
        query = query.in("status", toReviewStatuses).order("status", { ascending: false }).order("review_expires_at");
      } else if (list === "waiting_for_client") {
        query = query.eq("status", "needs_resubmission").order("review_expires_at");
      } else {
        query = query
          .in("status", refundStatuses)
          .is("refund_metadata", null)
          .in("payment_proofs.status", reportedProofStatuses)
          .order("updated_at", { ascending: false });
      }
      const { data, error, count } = await query.order("id").range(from, from + depositPageSize - 1);
      if (error) throw error;
      return { bookings: data.map(readRow), totalCount: count ?? 0 };
    },
  });
}

// The badge on "Deposits": reported payments with a decision due at the branch.
export function pendingDepositCountQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: [...depositsQueryKey(branchId), "pending-count"] as const,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .in("status", toReviewStatuses);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
