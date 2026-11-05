import { supabase } from "@/lib/supabase-client";

// Bookings still to happen at a branch: a visit waiting, arrived, or in service, a live hold, or a
// booking that blocks its slot and has not ended yet.
export async function hasUpcomingBookings(branchId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .or(
      `status.in.(payment_submitted,needs_resubmission,review_expired_pending_resolution,confirmed,waiting,checked_in,in_service),and(status.eq.held,hold_expires_at.gt.${now})`,
    )
    .or(`end_at.gt.${now},end_at.is.null`)
    .limit(1);
  if (error) throw error;
  return (count ?? 0) > 0;
}
