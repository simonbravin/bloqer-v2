import { auth } from "@bloqer/auth";
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
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
