/** Spanish labels for TreasurySettlementMethod ([D-074]). */
export const SETTLEMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Efectivo" },
  { value: "BANK_TRANSFER", label: "Transferencia" },
  { value: "CHECK", label: "Cheque" },
  { value: "CARD", label: "Tarjeta" },
  { value: "OTHER", label: "Otro" },
] as const;

export type SettlementMethodValue = (typeof SETTLEMENT_METHOD_OPTIONS)[number]["value"];

export function settlementMethodLabel(
  method: string | null | undefined,
): string | null {
  if (!method) return null;
  const found = SETTLEMENT_METHOD_OPTIONS.find((o) => o.value === method);
  return found?.label ?? method;
}
