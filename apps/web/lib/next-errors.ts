/** Next.js `redirect()` / `notFound()` throw control-flow errors that must not be caught as failures. */

function errorDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : undefined;
}

export function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  // Next may throw Error or a digest-bearing object; do not require `instanceof Error`.
  if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) return true;
  const digest = errorDigest(error);
  if (digest?.includes("NEXT_REDIRECT")) return true;
  // Some runtimes expose `message` without being a real Error instance.
  if ("message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message.includes("NEXT_REDIRECT");
  }
  return false;
}

export function isNextNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (error instanceof Error && error.message.includes("NEXT_NOT_FOUND")) return true;
  const digest = errorDigest(error);
  if (digest?.includes("NEXT_NOT_FOUND")) return true;
  if ("message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message.includes("NEXT_NOT_FOUND");
  }
  return false;
}

export function rethrowNextNavigationError(error: unknown): void {
  if (isNextRedirectError(error) || isNextNotFoundError(error)) {
    throw error;
  }
}
