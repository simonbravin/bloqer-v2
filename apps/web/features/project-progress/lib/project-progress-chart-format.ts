import { formatMoneyAmount } from "../../../lib/format-money";

const RAW_AMOUNT_KEYS: Record<string, string> = {
  certifiedValue: "certified",
  invoicedValue: "invoiced",
  collectedValue: "collected",
};

/** Chart coordinates may be numbers; monetary labels retain the exact service string. */
export function formatProjectProgressChartAmount(
  dataKey: unknown,
  payload: unknown,
  currency: string,
): string {
  if (typeof dataKey !== "string" || !payload || typeof payload !== "object") return "—";
  const rawKey = RAW_AMOUNT_KEYS[dataKey];
  const amount = rawKey ? (payload as Record<string, unknown>)[rawKey] : undefined;
  return typeof amount === "string" ? formatMoneyAmount(amount, currency) : "—";
}
