import { auth } from "@bloqer/auth/middleware";
import { safeCallbackUrl, stripLegacyEsLocalePrefix } from "@/lib/auth-callback-url";
import {
  INVITE_ACCEPT_TOKEN_COOKIE,
  inviteAcceptTokenCookieOptions,
} from "@/lib/invitation-accept-token-cookie";
import { NextResponse } from "next/server";

const REQUEST_ID_HEADER = "x-request-id";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_EXACT = new Set([
  "/login",
  "/registro",
  "/verificar-email",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/invitaciones/aceptar",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/invitaciones/aceptar/")) return true;
  // Cron routes authenticate via CRON_SECRET inside the handler (not session cookies).
  if (pathname.startsWith("/api/cron/")) return true;
  return false;
}

function resolveRequestId(incoming: string | null): string {
  const trimmed = incoming?.trim() ?? "";
  if (trimmed && UUID_RE.test(trimmed)) return trimmed;
  return crypto.randomUUID();
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  // Strip abandoned `/es` locale prefix before auth/public checks (avoids
  // `/es/login` → `/login?callbackUrl=/es/login` → post-login 404 loop).
  const withoutLocale = stripLegacyEsLocalePrefix(pathname);
  if (withoutLocale !== null) {
    const url = req.nextUrl.clone();
    url.pathname = withoutLocale;
    return NextResponse.redirect(url);
  }

  // Stash invite bearer token in httpOnly cookie and strip it from the URL
  // (RSC cannot cookies().set — must happen here or in a route handler).
  if (pathname === "/invitaciones/aceptar") {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (token) {
      const url = req.nextUrl.clone();
      url.searchParams.delete("token");
      const redirectRes = NextResponse.redirect(url);
      // Only stash well-formed invite tokens (64 hex); strip junk from the URL either way.
      if (/^[a-f0-9]{64}$/i.test(token)) {
        redirectRes.cookies.set(
          INVITE_ACCEPT_TOKEN_COOKIE,
          token.toLowerCase(),
          inviteAcceptTokenCookieOptions(),
        );
      }
      return redirectRes;
    }
  }

  const isAuthenticated = !!req.auth;
  const publicPath = isPublicPath(pathname);

  if (!isAuthenticated && !publicPath) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set(
      "callbackUrl",
      safeCallbackUrl(`${pathname}${req.nextUrl.search}`),
    );
    return NextResponse.redirect(loginUrl);
  }

  // Do NOT bounce JWT holders away from /login|/registro here.
  // Edge auth cannot check User.status / pwdAt; RSC pages call getSession() and
  // redirect only when the session is still valid (avoids suspend → login loops).

  const requestId = resolveRequestId(req.headers.get(REQUEST_ID_HEADER));

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  res.headers.set(REQUEST_ID_HEADER, requestId);

  // Access log only for API / mutations — avoid RSC prefetch noise.
  if (pathname.startsWith("/api/") || req.method !== "GET") {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        message: "http_request",
        requestId,
        method: req.method,
        path: pathname,
        authenticated: isAuthenticated,
      }),
    );
  }

  return res;
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
