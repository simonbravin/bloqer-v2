import { getEmailEnv, isEmailConfigured } from "@bloqer/config";
import { Resend } from "resend";

export type EmailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType: string;
};

export type EmailSendResult = {
  ok: boolean;
  provider: "resend" | "disabled";
  messageId?: string;
  error?: string;
  /** Only explicit provider rejection proves no message was accepted. */
  failureKind?: "rejected" | "unconfirmed";
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Stable only for a caller that already defines a single delivery identity. */
  idempotencyKey?: string;
};

const DEFINITIVE_REJECTIONS = new Set([
  "missing_required_field",
  "invalid_idempotency_key",
  "invalid_access",
  "invalid_parameter",
  "invalid_region",
  "rate_limit_exceeded",
  "missing_api_key",
  "invalid_api_key",
  "invalid_from_address",
  "validation_error",
  "not_found",
  "method_not_allowed",
]);

export function classifyEmailProviderError(name: string): NonNullable<EmailSendResult["failureKind"]> {
  return DEFINITIVE_REJECTIONS.has(name.toLowerCase()) ? "rejected" : "unconfirmed";
}

function toResendAttachment(a: EmailAttachment): { filename: string; content: Buffer | string; contentType?: string } {
  const content =
    typeof a.content === "string"
      ? a.content
      : Buffer.isBuffer(a.content)
        ? a.content
        : Buffer.from(a.content);
  return {
    filename: a.filename,
    content,
    contentType: a.contentType,
  };
}

/**
 * Sends via Resend when configured; otherwise no-op success with `provider: "disabled"`.
 * Never logs API keys or full message bodies.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    return { ok: true, provider: "disabled" };
  }

  const env = getEmailEnv();
  if (!env) {
    return { ok: true, provider: "disabled" };
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments.map(toResendAttachment) }
        : {}),
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);

    if (error) {
      return {
        ok: false,
        provider: "resend",
        error: typeof error.message === "string" ? error.message : "resend_error",
        failureKind: classifyEmailProviderError(error.name),
      };
    }

    if (!data?.id) return { ok: false, provider: "resend", error: "missing_provider_confirmation", failureKind: "unconfirmed" };
    return {
      ok: true,
      provider: "resend",
      messageId: data.id,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "resend",
      error: e instanceof Error ? e.message : "send_failed",
      failureKind: "unconfirmed",
    };
  }
}
