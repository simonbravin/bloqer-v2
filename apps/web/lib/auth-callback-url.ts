/**
 * Drop abandoned `/es` locale prefix (must not match paths like `/estado-resultados`).
 * Returns null when the path has no legacy prefix.
 */
export function stripLegacyEsLocalePrefix(pathname: string): string | null {
  if (pathname === "/es") return "/";
  if (pathname.startsWith("/es/")) {
    const stripped = pathname.slice(3);
    return stripped.length > 0 ? stripped : "/";
  }
  return null;
}

/**
 * Sanitize post-login redirect targets from query params.
 * Only same-origin relative paths are allowed.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/dashboard";
  if (trimmed.includes("://")) return "/dashboard";
  try {
    const parsed = new URL(trimmed, "http://bloqer.local");
    if (parsed.origin !== "http://bloqer.local") return "/dashboard";
    const pathname = stripLegacyEsLocalePrefix(parsed.pathname) ?? parsed.pathname;
    const path = `${pathname}${parsed.search}${parsed.hash}`;
    return path.startsWith("/") ? path : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/**
 * Resolve Auth.js `result.url` (may be absolute same-origin) to a safe path for
 * `window.location.assign`. Never follows cross-origin URLs.
 */
export function resolveClientPostLoginUrl(
  candidate: string | null | undefined,
  fallbackRelative: string,
): string {
  const fallback = safeCallbackUrl(fallbackRelative);
  if (!candidate) return fallback;
  const trimmed = candidate.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return safeCallbackUrl(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
      return safeCallbackUrl(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
  } catch {
    // ignore
  }
  return fallback;
}

/** Map Auth.js `?error=` codes to es-AR copy for the login page. */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthAccountNotLinked":
      return "Ese email ya tiene una cuenta. Iniciá con el mismo método que usaste antes, o recuperá tu contraseña.";
    case "AccessDenied":
      return "Acceso denegado. Si cancelaste en Google, podés intentar de nuevo.";
    case "Configuration":
      return "Hay un problema de configuración de inicio de sesión. Contactá a soporte.";
    case "OAuthCallback":
    case "OAuthSignIn":
    case "Callback":
      return "No se pudo completar el inicio de sesión con Google. Intentá de nuevo.";
    case "CredentialsSignin":
      return "Email o contraseña incorrectos, o la cuenta aún no está confirmada.";
    case "SessionRequired":
      return "Tenés que iniciar sesión para continuar.";
    default:
      return "No se pudo iniciar sesión. Intentá de nuevo.";
  }
}
