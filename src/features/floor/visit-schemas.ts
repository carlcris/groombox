import { z } from "zod";
import type { ClientChoice } from "@/features/floor/ClientPicker";
import { messages } from "@/lib/messages";

const clientSchema = z
  .custom<ClientChoice | null>()
  .refine((choice) => choice !== null && choice.fullName.trim() !== "", { error: messages.floor.chooseClient });
const serviceIdsSchema = z.array(z.string()).min(1, { error: messages.floor.chooseServices });
const requiredStaffSchema = z.string().nullable().refine((staffId) => staffId !== null, { error: messages.floor.chooseStaff });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: messages.validation.required });
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, { error: messages.validation.required });

export const walkInSchema = z.object({
  client: clientSchema,
  serviceIds: serviceIdsSchema,
  staffId: z.string().nullable(),
});

export const appointmentSchema = z.object({
  client: clientSchema,
  serviceIds: serviceIdsSchema,
  staffId: requiredStaffSchema,
  date: dateSchema,
  time: timeSchema,
});

export const rescheduleSchema = z.object({
  staffId: requiredStaffSchema,
  date: dateSchema,
  time: timeSchema,
});

export const startServiceSchema = z.object({ staffId: requiredStaffSchema });
