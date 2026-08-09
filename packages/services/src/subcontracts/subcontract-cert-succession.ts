import { ServiceError } from "../types";

/**
 * BR-SUB-005 / [D-082]: successor may only replace a REJECTED cert of the same subcontract.
 */
export function assertSubcontractCertSuccessionAllowed(params: {
  replacesCertificationId: string | null | undefined;
  predecessor: {
    id: string;
    subcontractId: string;
    status: string;
    tenantId: string;
  } | null;
  subcontractId: string;
  tenantId: string;
  /** Existing non-cancelled successor of the same predecessor, if any. */
  existingSuccessorId?: string | null;
}): void {
  const replacesId = params.replacesCertificationId?.trim() || null;
  if (!replacesId) return;

  if (!params.predecessor) {
    throw new ServiceError("NOT_FOUND", "Certificación a reemplazar no encontrada");
  }
  if (params.predecessor.tenantId !== params.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (params.predecessor.subcontractId !== params.subcontractId) {
    throw new ServiceError(
      "VALIDATION",
      "La certificación a reemplazar debe pertenecer al mismo subcontrato",
    );
  }
  if (params.predecessor.status !== "REJECTED") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede crear una nueva versión a partir de una certificación rechazada",
    );
  }
  if (params.predecessor.id !== replacesId) {
    throw new ServiceError("VALIDATION", "Identificador de sucesión inconsistente");
  }
  if (params.existingSuccessorId) {
    throw new ServiceError(
      "CONFLICT",
      "Ya existe una nueva versión de esta certificación rechazada",
    );
  }
}
