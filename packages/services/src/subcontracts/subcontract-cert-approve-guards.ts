import { ServiceError } from "../types";

/**
 * [D-055] Project AP issue requires WBS on every line.
 * Approve must fail early if any subcontract line lacks partida EDT.
 */
export function assertSubcontractCertificationLinesHaveWbs(
  lines: ReadonlyArray<{ subcontractLine: { wbsNodeId: string | null } }>,
): void {
  if (lines.some((l) => !l.subcontractLine.wbsNodeId)) {
    throw new ServiceError(
      "VALIDATION",
      "Cada línea del subcontrato debe tener partida EDT antes de aprobar la certificación (requerido para emitir la factura).",
    );
  }
}
