import type { Prisma } from "@bloqer/database";
import { toMoneyDecimal } from "../finance/money-decimal";

type InventoryMovementCostSource = {
  sourceType: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  purchaseReceiptLine: {
    purchaseOrderLine: {
      unitPrice: Prisma.Decimal;
      purchaseOrder: { currency: string };
    };
  } | null;
};

/** Call after parent-scope validation; a stored nominal alone never proves currency (D-124). */
export function inventoryMovementCostProvenance(row: InventoryMovementCostSource): {
  costCurrency: string | null;
  costWarning: string | null;
} {
  const order = row.purchaseReceiptLine?.purchaseOrderLine.purchaseOrder;
  const nativeCurrency =
    row.sourceType === "PURCHASE_RECEIPT" &&
    order &&
    row.unitCost?.equals(row.purchaseReceiptLine!.purchaseOrderLine.unitPrice) &&
    (row.totalCost == null ||
      row.totalCost.equals(toMoneyDecimal(row.unitCost.mul(row.quantity))) ||
      row.totalCost.equals(row.unitCost.mul(row.quantity).toDecimalPlaces(4)))
      ? order.currency
      : null;
  return {
    costCurrency: nativeCurrency,
    costWarning: nativeCurrency
      ? null
      : "Sin valuación comparable: el movimiento no registra moneda y origen de costo trazables. Los importes nominales no demuestran costo en ARS.",
  };
}
