export const PLATFORM_INVITE_LINK_FLASH_COOKIE = "bloqer_platform_invite_link_flash";
export const PLATFORM_INVITE_EMAIL_FLASH_COOKIE = "bloqer_platform_invite_email_flash";

export function platformInvitationFlashCookiePath(tenantId: string, invitationId?: string): string {
  if (invitationId) {
    return `/platform/tenants/${tenantId}/invitations/${invitationId}`;
  }
  return `/platform/tenants/${tenantId}/invitations`;
}
