/** Email-based account linking requires explicit ownership proof from Google. */
export function hasVerifiedGoogleEmail(profile: unknown): boolean {
  return typeof profile === "object"
    && profile !== null
    && "email_verified" in profile
    && profile.email_verified === true;
}
