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
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
};

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
    });

    if (error) {
      return {
        ok: false,
        provider: "resend",
        error: typeof error.message === "string" ? error.message : "resend_error",
      };
    }

    return {
      ok: true,
      provider: "resend",
      messageId: data?.id,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "resend",
      error: e instanceof Error ? e.message : "send_failed",
    };
  }
}
