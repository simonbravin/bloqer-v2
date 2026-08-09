import { ServiceError } from "../types";

export type CancelAccountMovementGuardInput = {
  status: string;
  sourceType: string;
  transferId: string | null;
};

/** Proc-CANCEL-TRZ-001: treasury movements tied to aggregates cannot be cancelled directly. */
export function assertCanCancelAccountMovement(input: CancelAccountMovementGuardInput): void {
  if (input.status === "RECONCILED") {
    throw new ServiceError(
      "CONFLICT",
      "El movimiento está conciliado. Desconciliá antes de cancelarlo.",
    );
  }
  if (input.status !== "CONFIRMED") {
    throw new ServiceError(
      "CONFLICT",
      `El movimiento en estado "${input.status}" no puede cancelarse directamente`,
    );
  }
  if (input.transferId || input.sourceType === "INTERNAL_TRANSFER") {
    throw new ServiceError(
      "CONFLICT",
      "Este movimiento pertenece a una transferencia interna. Cancelá la transferencia en su lugar.",
    );
  }
  if (input.sourceType === "COLLECTION") {
    throw new ServiceError(
      "CONFLICT",
      "Este movimiento fue generado por una cobranza. Cancelá la cobranza en su lugar.",
    );
  }
  if (input.sourceType === "PAYMENT") {
    throw new ServiceError(
      "CONFLICT",
      "Este movimiento fue generado por un pago. Cancelá el pago en su lugar.",
    );
  }
  if (input.sourceType === "OPENING_BALANCE") {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar el saldo inicial del movimiento. Modificá la cuenta de tesorería.",
    );
  }
}
