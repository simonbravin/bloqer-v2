import { roundToDecimals } from "@bloqer/utils";

/** Schedule progress is Prisma Decimal(5,2) — always 2 dp half-up ([D-053] non-money scale for %). */
export function serializeProgressPct(raw: string | number): string {
  return roundToDecimals(raw, 2);
}

function toCents2(raw: string): bigint {
  const s = serializeProgressPct(raw);
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [i, f = ""] = abs.split(".");
  const cents = BigInt(`${i}${f.padEnd(2, "0").slice(0, 2)}`);
  return neg ? -cents : cents;
}

/** Pure helpers for D-045 sync — testable without Prisma / without IEEE float. */
export function capSyncProgressPct(pct: string | number): string | null {
  const rounded = serializeProgressPct(pct);
  if (toCents2(rounded) <= BigInt(0)) return null;
  // Over 100% (bad jobsite data / qty overflow) → clamp so sync still advances the item.
  if (toCents2(rounded) > BigInt(10000)) return "100.00";
  return rounded;
}

export function resolveScheduleStatusAfterProgressSync(
  current: import("@bloqer/database").ScheduleItemStatus,
  pct: string | number,
): import("@bloqer/database").ScheduleItemStatus {
  const cents = toCents2(serializeProgressPct(pct));
  if (cents >= BigInt(10000) && current === "IN_PROGRESS") return "COMPLETED";
  if (cents > BigInt(0) && current === "PLANNED") return "IN_PROGRESS";
  return current;
}
