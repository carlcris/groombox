import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import type { Database, Json } from "@/types/database.types";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type ProofStatus = Database["public"]["Enums"]["proof_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// The latest payment report: its status and the shop's note for anyone holding the code; what was
// reported only for the creator and the branch's members.
export type LatestProof = {
  status: ProofStatus;
  reviewNote: string | null;
  referenceNumber: string | null;
  amountPaid: number | null;
  method: PaymentMethod | null;
};

export type BookedService = { name: string; durationMinutes: number; price: number };

// The payment details as they were when the slot was held.
export type BookingPaymentDetails = {
  method: string;
  accountName: string;
  accountNumber: string;
  qrPath: string;
};

// The client-facing view of one booking. It never holds the client's mobile number or the shop's
// notes; the client's name and note come only to the creator and the branch's members.
export type BookingView = {
  bookingId: string;
  bookingCode: string;
  organizationId: string;
  status: BookingStatus;
  branchName: string;
  branchSlug: string;
  branchAddress: string;
  branchContactNumber: string;
  branchTimezone: string;
  organizationName: string;
  staffDisplayName: string | null;
  startAt: string | null;
  servicesEndAt: string | null;
  services: BookedService[];
  serviceTotal: number;
  depositAmount: number;
  convenienceFee: number;
  amountDue: number;
  paymentDetails: BookingPaymentDetails | null;
  bookedAt: string;
  holdExpiresAt: string | null;
  reviewExpiresAt: string | null;
  latestProof: LatestProof | null;
  cancellationPolicy: string;
  cancelledBy: "client" | "shop" | null;
  clientName: string | null;
  clientNote: string | null;
  viewerIsCreator: boolean;
  viewerIsMember: boolean;
  bookedByGuest: boolean;
};

function readRecord(value: Json | null): Record<string, Json | undefined> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function readServices(value: Json): BookedService[] {
  if (!Array.isArray(value)) throw new Error("get_booking_by_code.services is not an array.");
  return value.map((entry) => {
    const service = readRecord(entry);
    if (!service || typeof service.name !== "string" || typeof service.duration_minutes !== "number" || typeof service.price !== "number") {
      throw new Error("get_booking_by_code.services has an unexpected entry.");
    }
    return { name: service.name, durationMinutes: service.duration_minutes, price: service.price };
  });
}

function readPaymentDetails(value: Json | null): BookingPaymentDetails | null {
  const details = readRecord(value);
  if (!details) return null;
  const { method, account_name: accountName, account_number: accountNumber, qr_path: qrPath } = details;
  if (typeof method !== "string" || typeof accountName !== "string" || typeof accountNumber !== "string" || typeof qrPath !== "string") {
    return null;
  }
  return { method, accountName, accountNumber, qrPath };
}

export function bookingByCodeQueryKey(bookingCode: string) {
  return ["booking-by-code", bookingCode] as const;
}

// What the function returns depends on who asks (creator, member, or anyone else); the root layout
// refetches cached reads whenever someone signs in.
export function bookingByCodeQueryOptions(bookingCode: string) {
  return queryOptions({
    queryKey: bookingByCodeQueryKey(bookingCode),
    queryFn: async (): Promise<BookingView | null> => {
      const { data, error } = await supabase.rpc("get_booking_by_code", { p_booking_code: bookingCode });
      if (error) throw error;
      const row = data[0];
      if (!row) return null;
      const cancelledBy = row.cancelled_by === "client" || row.cancelled_by === "shop" ? row.cancelled_by : null;
      const policy = readRecord(row.policy_acceptance);
      return {
        bookingId: row.booking_id,
        bookingCode: row.booking_code,
        organizationId: row.organization_id,
        status: row.status,
        branchName: row.branch_name,
        branchSlug: row.branch_slug,
        branchAddress: [row.branch_address, row.branch_area, row.branch_city].filter(Boolean).join(", "),
        branchContactNumber: row.branch_contact_number ?? "",
        branchTimezone: row.branch_timezone,
        organizationName: row.organization_name,
        staffDisplayName: row.staff_display_name,
        startAt: row.start_at,
        servicesEndAt: row.services_end_at,
        services: readServices(row.services),
        serviceTotal: row.service_total,
        depositAmount: row.deposit_amount,
        convenienceFee: row.convenience_fee,
        amountDue: row.amount_due,
        paymentDetails: readPaymentDetails(row.payment_instructions),
        bookedAt: row.booked_at,
        holdExpiresAt: row.hold_expires_at,
        reviewExpiresAt: row.review_expires_at,
        latestProof: row.latest_proof_status
          ? {
              status: row.latest_proof_status,
              reviewNote: row.latest_proof_review_note,
              referenceNumber: row.latest_proof_reference_number,
              amountPaid: row.latest_proof_amount_paid,
              method: row.latest_proof_method,
            }
          : null,
        cancellationPolicy: typeof policy?.cancellation_policy === "string" ? policy.cancellation_policy : "",
        cancelledBy,
        clientName: row.client_name,
        clientNote: row.client_note,
        viewerIsCreator: row.viewer_is_creator,
        viewerIsMember: row.viewer_is_member,
        bookedByGuest: row.booked_by_guest,
      };
    },
  });
}

export function isClientCancellable(booking: BookingView): boolean {
  const cancellableStatuses: BookingStatus[] = [
    "held",
    "payment_submitted",
    "needs_resubmission",
    "review_expired_pending_resolution",
    "confirmed",
  ];
  return cancellableStatuses.includes(booking.status) && booking.startAt !== null && new Date(booking.startAt) > new Date();
}
