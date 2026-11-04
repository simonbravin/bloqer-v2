/**
 * Credentials must keep the epoch read when the password was checked. Reading it
 * again could grant a login in flight the epoch of a concurrent password reset.
 * OAuth proves identity independently and resolves the current epoch after linking.
 */
export async function resolveSignInPasswordEpoch(
  provider: string | undefined,
  user: { id: string; passwordUpdatedAt?: Date | null },
  loadPasswordUpdatedAt: (userId: string) => Promise<Date | null>,
): Promise<string | null> {
  const at = provider === "credentials"
    ? user.passwordUpdatedAt ?? null
    : await loadPasswordUpdatedAt(user.id);
  return at?.toISOString() ?? null;
}
