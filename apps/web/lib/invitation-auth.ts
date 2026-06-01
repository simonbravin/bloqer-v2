/** Pure helpers for invitation accept/login flows (no server-only deps). */

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function invitationEmailsMatch(a: string, b: string): boolean {
  return normalizeInvitationEmail(a) === normalizeInvitationEmail(b);
}

export function isPlausibleInvitationEmail(email: string): boolean {
  const norm = normalizeInvitationEmail(email);
  return norm.length > 3 && norm.includes("@") && !norm.includes(" ");
}

export function buildInvitationAcceptCallbackUrl(token: string): string {
  return `/invitaciones/aceptar?token=${encodeURIComponent(token)}`;
}

export function buildInvitationLoginHref(callbackUrl: string, invitedEmail: string): string {
  const params = new URLSearchParams({
    callbackUrl,
    selectAccount: "1",
    invitedEmail: normalizeInvitationEmail(invitedEmail),
  });
  return `/login?${params.toString()}`;
}

export function isInvitationAcceptCallbackUrl(url: string): boolean {
  return url.startsWith("/invitaciones/aceptar");
}

export type GoogleInvitationAuthParams = {
  prompt: "select_account";
  login_hint?: string;
};

export function buildGoogleInvitationAuthParams(invitedEmail?: string): GoogleInvitationAuthParams | undefined {
  const hint = invitedEmail?.trim();
  if (!hint || !isPlausibleInvitationEmail(hint)) {
    return { prompt: "select_account" };
  }
  return { prompt: "select_account", login_hint: normalizeInvitationEmail(hint) };
}
