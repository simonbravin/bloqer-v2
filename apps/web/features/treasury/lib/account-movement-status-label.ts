import type { AccountMovementStatus } from "@bloqer/database";

/** Spanish labels for AccountMovementStatus (DB enum). */
export function accountMovementStatusLabel(status: AccountMovementStatus | string): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmado";
    case "RECONCILED":
      return "Conciliado";
    case "CANCELLED":
      return "Cancelado";
    default:
      return String(status);
  }
}

export function accountMovementStatusBadgeVariant(
  status: AccountMovementStatus | string,
): "default" | "secondary" | "outline" {
  if (status === "CONFIRMED") return "default";
  if (status === "RECONCILED") return "secondary";
  return "outline";
}
