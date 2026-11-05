import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export type ClientDetails = { fullName: string; mobileNumber: string };

// A Philippine mobile number as people type it: digits with optional spaces, dashes, or a leading +.
export const clientDetailsSchema = z.object({
  fullName: z.string().trim().min(1, { error: messages.validation.required }),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]+$/, { error: messages.booking.mobileInvalid })
    .refine((value) => value.replace(/\D/g, "").length >= 10, { error: messages.booking.mobileInvalid }),
});

// The signed-in account's own name and number, to prefill the details step.
export function ownProfileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["own-profile", userId],
    queryFn: async (): Promise<ClientDetails> => {
      const { data, error } = await supabase.from("profiles").select("full_name, mobile_number").eq("id", userId).maybeSingle();
      if (error) throw error;
      return { fullName: data?.full_name ?? "", mobileNumber: data?.mobile_number ?? "" };
    },
  });
}
