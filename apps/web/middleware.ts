import { auth } from "@bloqer/auth/middleware";
import { isInvitationAcceptCallbackUrl } from "@/lib/invitation-auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isPublicInvitationAccept =
    req.nextUrl.pathname === "/invitaciones/aceptar" || req.nextUrl.pathname.startsWith("/invitaciones/aceptar/");

  if (!isAuthenticated && !isAuthRoute && !isPublicInvitationAccept) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthenticated && isAuthRoute) {
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
