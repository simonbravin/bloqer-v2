/** Idle timeout: JWT cookie refreshed while the user is active; expires after this much inactivity. */
export const SESSION_IDLE_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

/** Hard cap from login (`authTime`), even if the idle cookie keeps refreshing. */
export const SESSION_ABSOLUTE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days
