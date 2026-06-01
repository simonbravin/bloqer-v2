/** Next.js `redirect()` / `notFound()` throw control-flow errors that must not be caught as failures. */
export function isNextRedirectError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("NEXT_REDIRECT");
}

export function isNextNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("NEXT_NOT_FOUND");
}

export function rethrowNextNavigationError(error: unknown): void {
  if (isNextRedirectError(error) || isNextNotFoundError(error)) {
    throw error;
  }
}
