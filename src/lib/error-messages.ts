import { PublishGuardError } from "@/features/organization/publish-guard-error";
import { messages } from "@/lib/messages";

// Database functions raise coded errors (SQLSTATE class GB) and Supabase Auth returns error codes.
// Each known code maps to a safe message; anything else gets the generic one. Raw database or
// exception text is never shown.
const databaseErrorMessages: Record<string, string> = {
  GBA01: messages.errors.signInRequired,
  GBA02: messages.errors.notPermitted,
  GBI01: messages.errors.inviteUnavailable,
  GBI02: messages.errors.alreadyMember,
  GBM01: messages.errors.ownerMembershipLocked,
  "42501": messages.errors.notPermitted,
  "23503": messages.errors.stillInUse,
  "23505": messages.errors.alreadyTaken,
};

const authErrorMessages: Record<string, string> = {
  invalid_credentials: messages.errors.invalidCredentials,
  user_already_exists: messages.errors.accountExists,
  email_exists: messages.errors.accountExists,
  weak_password: messages.errors.weakPassword,
  over_request_rate_limit: messages.errors.tooManyAttempts,
  over_email_send_rate_limit: messages.errors.tooManyAttempts,
  email_not_confirmed: messages.errors.emailNotConfirmed,
};

function readCode(error: object): string | null {
  if ("code" in error && typeof error.code === "string") return error.code;
  return null;
}

export function describeError(error: unknown): string {
  if (error instanceof PublishGuardError) return error.message;
  if (error instanceof TypeError) return messages.errors.network;
  if (typeof error !== "object" || error === null) return messages.errors.generic;
  if ("name" in error && error.name === "AuthRetryableFetchError") return messages.errors.network;
  const code = readCode(error);
  if (code === null) return messages.errors.generic;
  return databaseErrorMessages[code] ?? authErrorMessages[code] ?? messages.errors.generic;
}
