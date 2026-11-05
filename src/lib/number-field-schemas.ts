import { z } from "zod";
import { fillTemplate, messages } from "@/lib/messages";

// Number inputs hold text; these schemas check the text and the form converts it on submit.
function isNumberText(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

export function wholeNumberText(min: number, max: number) {
  const message = fillTemplate(messages.validation.wholeNumberRange, { min: String(min), max: String(max) });
  return z.string().refine((value) => {
    if (!isNumberText(value)) return false;
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max;
  }, { error: message });
}

// Money with at most two decimal places.
export function amountText({ allowZero }: { allowZero: boolean }) {
  return z.string().refine((value) => {
    if (!isNumberText(value) || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return false;
    return allowZero ? Number(value) >= 0 : Number(value) > 0;
  }, { error: allowZero ? messages.validation.amountZeroOrMore : messages.validation.amountAboveZero });
}

export function percentText({ allowZero }: { allowZero: boolean }) {
  return z.string().refine((value) => {
    if (!isNumberText(value) || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return false;
    const number = Number(value);
    return (allowZero ? number >= 0 : number > 0) && number <= 100;
  }, { error: allowZero ? messages.validation.percentRange : messages.validation.percentAboveZero });
}

export function optional<Schema extends z.ZodType<string>>(schema: Schema) {
  return z.union([z.literal(""), schema]);
}

export function textToNumber(value: string): number {
  return Number(value.trim());
}

export function textToOptionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value.trim());
}
