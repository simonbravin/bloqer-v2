/** Next.js `redirect()` / `notFound()` throw control-flow errors that must not be caught as failures. */

function errorDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : undefined;
}

export function isNextRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("NEXT_REDIRECT")) return true;
  const digest = errorDigest(error);
  return Boolean(digest?.includes("NEXT_REDIRECT"));
}

export function isNextNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("NEXT_NOT_FOUND")) return true;
  const digest = errorDigest(error);
  return Boolean(digest?.includes("NEXT_NOT_FOUND"));
}

export function rethrowNextNavigationError(error: unknown): void {
  if (isNextRedirectError(error) || isNextNotFoundError(error)) {
    throw error;
  }
}
