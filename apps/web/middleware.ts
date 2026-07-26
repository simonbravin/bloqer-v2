import { auth } from "@bloqer/auth/middleware";
import { safeCallbackUrl } from "@/lib/auth-callback-url";
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

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const pathname = req.nextUrl.pathname;
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

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
