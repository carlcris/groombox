import { z } from "zod";
import { messages } from "@/lib/messages";

export const signInSchema = z.object({
  email: z.email({ error: messages.validation.email }),
  password: z.string().min(1, { error: messages.validation.required }),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, { error: messages.validation.required }),
  email: z.email({ error: messages.validation.email }),
  password: z.string().min(8, { error: messages.validation.passwordLength }),
});
