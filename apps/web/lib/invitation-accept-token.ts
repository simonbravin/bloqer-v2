import { cookies } from "next/headers";
import {
  INVITE_ACCEPT_TOKEN_COOKIE,
  INVITE_ACCEPT_TOKEN_COOKIE_PATH,
  inviteAcceptTokenCookieOptions,
} from "./invitation-accept-token-cookie";

export {
  INVITE_ACCEPT_TOKEN_COOKIE,
  INVITE_ACCEPT_TOKEN_COOKIE_PATH,
  inviteAcceptTokenCookieOptions,
} from "./invitation-accept-token-cookie";

export async function stashInviteAcceptToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;
  const c = await cookies();
  c.set(INVITE_ACCEPT_TOKEN_COOKIE, trimmed, inviteAcceptTokenCookieOptions());
}

export async function readInviteAcceptToken(): Promise<string | null> {
  const c = await cookies();
  const raw = c.get(INVITE_ACCEPT_TOKEN_COOKIE)?.value?.trim();
  return raw || null;
}

export async function clearInviteAcceptToken(): Promise<void> {
  const c = await cookies();
  c.delete({ name: INVITE_ACCEPT_TOKEN_COOKIE, path: INVITE_ACCEPT_TOKEN_COOKIE_PATH });
}
