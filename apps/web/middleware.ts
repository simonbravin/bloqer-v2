import { auth } from "@bloqer/auth/middleware";
import { isInvitationAcceptCallbackUrl } from "@/lib/invitation-auth";
import { NextResponse } from "next/server";

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
  return false;
}

/** Only bounce signed-in users away from entry screens (keep verify/reset usable). */
function isAuthEntryPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/registro";
}

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const pathname = req.nextUrl.pathname;
  const publicPath = isPublicPath(pathname);

  if (!isAuthenticated && !publicPath) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthenticated && isAuthEntryPath(pathname)) {
    const callbackUrl = req.nextUrl.searchParams.get("callbackUrl");
    if (callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") && isInvitationAcceptCallbackUrl(callbackUrl)) {
      return NextResponse.redirect(new URL(callbackUrl, req.nextUrl));
    }
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
