/** Cookie name/options shared by middleware (edge) and server actions — no next/headers. */

export const INVITE_ACCEPT_TOKEN_COOKIE = "bloqer_invite_accept_token";
export const INVITE_ACCEPT_TOKEN_COOKIE_PATH = "/invitaciones";
export const INVITE_ACCEPT_TOKEN_MAX_AGE_SEC = 60 * 30;

export function inviteAcceptTokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: INVITE_ACCEPT_TOKEN_COOKIE_PATH,
    maxAge: INVITE_ACCEPT_TOKEN_MAX_AGE_SEC,
  };
}
