const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keys whose values are opaque IDs — never print raw UUIDs in PDF headers (REPORTING_ARCHITECTURE). */
const STRUCTURAL_FILTER_KEYS = new Set([
  "accountId",
  "budgetId",
  "companyId",
  "contactId",
  "productId",
  "projectId",
  "warehouseId",
]);

const FILTER_LABEL_ES: Record<string, string> = {
  accountId: "Cuenta",
  budgetId: "Presupuesto",
  companyId: "Empresa",
  contactId: "Contacto",
  costLayer: "Capa costo",
  currency: "Moneda",
  dateFrom: "Desde",
  dateTo: "Hasta",
  dueDateFrom: "Venc. desde",
  dueDateTo: "Venc. hasta",
  issueDateFrom: "Emisión desde",
  issueDateTo: "Emisión hasta",
  period: "Período",
  productId: "Producto",
  projectId: "Proyecto",
  status: "Estado",
  warehouseId: "Depósito",
};

function formatFilterValue(key: string, value: string): string {
  const trimmed = value.trim();
  if (STRUCTURAL_FILTER_KEYS.has(key) || UUID_RE.test(trimmed)) {
    return "(filtro activo)";
  }
  return trimmed;
}

/** Human-readable filter summary for PDF headers; redacts business UUIDs. */
export function buildPdfFilterLine(filters: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(filters)) {
    if (!raw?.trim()) continue;
    const label = FILTER_LABEL_ES[key] ?? key;
    parts.push(`${label}: ${formatFilterValue(key, raw)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Ninguno";
}
