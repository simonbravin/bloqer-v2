import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const AUTH_TOKEN_PURPOSE = {
  EMAIL_VERIFY: "email-verify",
  PASSWORD_RESET: "password-reset",
} as const;

export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const AUTH_TOKEN_RESEND_COOLDOWN_MS = 90 * 1000;

export function authTokenIdentifier(purpose: AuthTokenPurpose, emailNorm: string): string {
  return `${purpose}:${emailNorm}`;
}

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateRawAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
