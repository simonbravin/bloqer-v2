import { ServiceError } from "../types";

/** Certification links are assigned only by createInvoiceFromCertification after its scope/status checks. */
export function assertManualInvoiceHasNoCertificationLinks(input: {
  certificationId?: string | null;
  lines: ReadonlyArray<{ certificationLineId?: string | null }>;
}): void {
  if (input.certificationId || input.lines.some((line) => line.certificationLineId)) {
    throw new ServiceError(
      "CONFLICT",
      "Para facturar una certificación usá el flujo de factura desde certificación.",
    );
  }
}
