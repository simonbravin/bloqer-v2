/** Mitigate SMTP header injection when a title is used as Subject. */
export function sanitizeEmailSubject(title: string): string {
  return title.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 998);
}

/**
 * Prefix the inbox subject with the tenant/organización so multi-tenant
 * operators can tell Indari vs a test workspace without opening the mail.
 */
export function formatNotificationEmailSubject(
  title: string,
  organizationName: string | null | undefined,
): string {
  const safeTitle = sanitizeEmailSubject(title);
  const org = organizationName ? sanitizeEmailSubject(organizationName) : "";
  if (!org) return safeTitle;
  return sanitizeEmailSubject(`[${org}] ${safeTitle}`);
}
