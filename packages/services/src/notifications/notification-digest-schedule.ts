/** Preview of the deployed daily cron; keep aligned with vercel.json and D-114. */
export function getDigestSchedulePreview(timezone: string, now: Date) {
  const reviewAt = new Date(now);
  reviewAt.setUTCHours(10, 5, 0, 0);
  if (reviewAt.getTime() <= now.getTime()) reviewAt.setUTCDate(reviewAt.getUTCDate() + 1);
  const localHour = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(reviewAt));
  // The runner permits the configured hour and up to three later hours on the same local day.
  const eligibleHours = Array.from({ length: localHour + 1 }, (_, hour) => hour)
    .filter((hour) => localHour <= hour + 3);
  const reviewLabel = new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(reviewAt);
  return { reviewAtIso: reviewAt.toISOString(), reviewLabel, eligibleHours, timezone };
}

export type DigestSchedulePreview = ReturnType<typeof getDigestSchedulePreview>;
