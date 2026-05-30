import type { RegisterSupplierAdvanceInput } from "@bloqer/validators";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

/**
 * Pago anticipado a proveedor sin factura emitida.
 * Phase 2 — requiere entidad puente (ADR-013). No usar pago directo a C×P inexistente.
 */
export async function registerSupplierAdvance(
  _input: RegisterSupplierAdvanceInput,
  _ctx: ServiceContext,
): Promise<never> {
  throw new ServiceError(
    "CONFLICT",
    "Los anticipos a proveedor (cuenta puente) están planificados para Fase 2. Ver ADR-013. " +
      "Hoy registrá factura de proveedor + pago parcial, o contactá al administrador.",
  );
}
