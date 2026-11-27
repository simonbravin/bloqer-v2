import type { FieldPendingItem } from "./field-pending.service";
import { fieldPendingComprasStageLabel } from "./field-pending-labels";

export const PENDING_EXPORT_COLUMNS = [
  ["document", "Documento"], ["projectCode", "Código de obra"], ["projectName", "Obra"],
  ["type", "Tipo"], ["stage", "Etapa"], ["description", "Descripción / proveedor"],
  ["status", "Estado"], ["action", "Acción pendiente"], ["requestedBy", "Solicitante"],
  ["date", "Fecha de referencia (UTC)"], ["overdueDays", "Días del indicador de vencimiento"],
  ["currency", "Moneda"], ["amount", "Monto del documento"], ["path", "Ruta en Bloqer"],
] as const;

export function pendingExportRows(items: FieldPendingItem[]): Record<string, string>[] {
  return items.map((item) => ({
    document: item.title, projectCode: item.projectCode, projectName: item.projectName,
    type: item.typeLabel, stage: fieldPendingComprasStageLabel(item.entityType) ?? item.typeLabel,
    description: item.description ?? "", status: item.statusLabel, action: item.actionLabel,
    requestedBy: item.requestedByName ?? "", date: item.occurredAt.toISOString(),
    overdueDays: String(item.overdueDays), currency: item.currency ?? "", amount: item.amount ?? "",
    path: item.href,
  }));
}
