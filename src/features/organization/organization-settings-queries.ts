import { queryOptions } from "@tanstack/react-query";
import type { OrganizationCategory } from "@/features/organization/organization-categories";
import { supabase } from "@/lib/supabase-client";
import type { Database } from "@/types/database.types";

export type DepositType = Database["public"]["Enums"]["deposit_type"];

export type OrganizationSettings = {
  id: string;
  name: string;
  category: OrganizationCategory;
  logoPath: string | null;
  isListed: boolean;
  depositType: DepositType;
  depositFixedAmount: number | null;
  depositPercent: number | null;
  holdMinutes: number;
  reviewHours: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  cancellationPolicy: string | null;
  termsAcceptedAt: string | null;
};

export function organizationSettingsQueryKey(organizationId: string) {
  return ["organization-settings", organizationId] as const;
}

export function organizationSettingsQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: organizationSettingsQueryKey(organizationId),
    queryFn: async (): Promise<OrganizationSettings> => {
      const { data, error } = await supabase
        .from("organizations")
        .select(
          "id, name, category, logo_path, is_listed, deposit_type, deposit_fixed_amount, deposit_percent, hold_minutes, review_hours, slot_interval_minutes, min_notice_minutes, booking_horizon_days, cancellation_policy, terms_accepted_at",
        )
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      return {
        id: data.id,
        name: data.name,
        category: data.category,
        logoPath: data.logo_path,
        isListed: data.is_listed,
        depositType: data.deposit_type,
        depositFixedAmount: data.deposit_fixed_amount,
        depositPercent: data.deposit_percent,
        holdMinutes: data.hold_minutes,
        reviewHours: data.review_hours,
        slotIntervalMinutes: data.slot_interval_minutes,
        minNoticeMinutes: data.min_notice_minutes,
        bookingHorizonDays: data.booking_horizon_days,
        cancellationPolicy: data.cancellation_policy,
        termsAcceptedAt: data.terms_accepted_at,
      };
    },
  });
}
