/**
 * Short-lived httpOnly cookie: full invitation URL for admin copy when the invitation
 * email was not dispatched (see SESSION_HANDOFF / SECURITY 10C).
 */
export const TENANT_INVITE_LINK_FLASH_COOKIE = "bloqer_invite_link_flash";
export const TENANT_INVITE_EMAIL_FLASH_COOKIE = "bloqer_invite_email_flash";

/** Cookie path prefix so the flash is not sent on unrelated routes (detail lives under this). */
export const TENANT_INVITE_LINK_FLASH_COOKIE_PATH = "/configuracion/equipo/invitaciones";

export function tenantInvitationFlashCookiePath(invitationId?: string): string {
  if (invitationId) {
    return `/configuracion/equipo/invitaciones/${invitationId}`;
  }
  return TENANT_INVITE_LINK_FLASH_COOKIE_PATH;
}
