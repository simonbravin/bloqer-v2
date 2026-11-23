import { z } from "zod";
import { Prisma } from "@bloqer/database";
import { createAiProviderFromEnv, extractProcurementQuoteDocument, getBloqerAiEnv, isProcurementQuotePreviewEnabled,
  SUPPLIER_INVOICE_PREVIEW_MAX_BYTES, SUPPLIER_INVOICE_PREVIEW_MIME_TYPES,
  type ProcurementQuoteDocumentExtraction, type ProcurementQuoteDocumentPreview, type SupplierInvoicePreviewMime } from "@bloqer/ai";
import { ServiceError, type ServiceContext } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { assertUploadContentMatchesDeclaredMime } from "../documents/sniff-upload-content";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";
import { canManageProcurementQuotes } from "./procurement-access";
import { getPurchaseRequestById } from "./purchase-request.service";

const defaults = {
  enabled: isProcurementQuotePreviewEnabled, module: assertProcurementTenantModule,
  request: getPurchaseRequestById, project: assertProjectAllowsOperationalMutation,
  sniff: assertUploadContentMatchesDeclaredMime, provider: createAiProviderFromEnv, config: getBloqerAiEnv,
};

export function procurementQuoteDocumentAvailable(): boolean {
  if (!isProcurementQuotePreviewEnabled()) return false;
  try { const p = createAiProviderFromEnv(); return p.capabilities.supportsVision && p.capabilities.supportsStructuredOutput; }
  catch { return false; }
}

/** Same financial kernel as quote creation; no writes and no inferred missing amounts. */
export function buildProcurementQuoteDocumentPreview(fields: ProcurementQuoteDocumentExtraction): ProcurementQuoteDocumentPreview {
  const blockingReasons: string[] = [];
  const warnings = ["Elegí el proveedor y vinculá cada renglón manualmente. La lectura puede contener errores.",
    "Se conservan las cantidades y unidades de la solicitud; no se convierten bultos ni se adjudica una oferta."];
  if (fields.documentKind !== "QUOTE" || !fields.lines.length) blockingReasons.push("El archivo no contiene una cotización identificable con renglones. Usá carga manual.");
  if (fields.hasUnsupportedCharges) blockingReasons.push("Hay cargos, impuestos o descuentos globales no representados. Revisalos por carga manual.");
  if (fields.hasUnsupportedCharges === null) warnings.push("Confirmá que no existan otros cargos, impuestos o descuentos globales antes de continuar.");
  if (fields.lines.some(l => l.offerKind === "NOT_QUOTED" &&
    ((l.unitPrice !== null && !new Prisma.Decimal(l.unitPrice).isZero()) || (l.discountPct !== null && !new Prisma.Decimal(l.discountPct).isZero())))) {
    blockingReasons.push("Un renglón No cotizado contiene precio o descuento. Revisá el original por carga manual.");
  }
  const complete = fields.pricesIncludeTax !== null && fields.iibbPerceptionRate !== null && fields.lines.length > 0 &&
    fields.lines.every(l => l.offerKind !== null && l.quantity !== null && l.unitPrice !== null && l.taxRate !== null && l.discountPct !== null);
  if (complete) {
    try {
      const calculated = fields.lines.map(l => resolveInvoiceLineMoney({ quantity: new Prisma.Decimal(l.quantity!), unitPrice: new Prisma.Decimal(l.unitPrice!), taxRate: new Prisma.Decimal(l.taxRate!), discountPct: new Prisma.Decimal(l.discountPct!), pricesIncludeTax: fields.pricesIncludeTax! }));
      for (let i = 0; i < fields.lines.length; i++) {
        const kind = fields.lines[i]!.offerKind;
        if ((kind === "QUOTED" && !calculated[i]!.lineTotal.gt(0)) || (kind !== "QUOTED" && !calculated[i]!.lineTotal.isZero())) blockingReasons.push("La clasificación y el importe de un renglón no coinciden. Revisá el original por carga manual.");
      }
      const totals = headerTotalsWithIibbPerception({ lineSubtotals: calculated.map(l => l.lineSubtotal), lineTaxes: calculated.map(l => l.lineTax), iibbPerceptionRate: new Prisma.Decimal(fields.iibbPerceptionRate!) });
      if (fields.total !== null && totals.totalAmount.minus(fields.total).abs().gt("0.01")) blockingReasons.push("El total leído no coincide con los renglones e impuestos. Revisá el original por carga manual.");
    } catch { blockingReasons.push("Los importes requieren revisión por carga manual."); }
  } else warnings.push("Faltan datos para cotejar importes. Completá los campos vacíos y compará el total del formulario con el original.");
  return { ...fields, warnings, blockingReasons };
}

export async function previewProcurementQuoteDocument(input: {
  projectId: string; purchaseRequestId: string; bytes: Uint8Array; mimeType: string; signal?: AbortSignal;
}, ctx: ServiceContext, deps: typeof defaults = defaults): Promise<ProcurementQuoteDocumentPreview> {
  if (!ctx.tenantId || !ctx.actorUserId) throw new ServiceError("UNAUTHORIZED", "Sesión requerida.");
  if (!deps.enabled()) throw new ServiceError("FORBIDDEN", "La lectura de cotizaciones no está habilitada.");
  if (!z.string().guid().safeParse(input.projectId).success || !z.string().guid().safeParse(input.purchaseRequestId).success) throw new ServiceError("VALIDATION", "Solicitud inválida.");
  await deps.module(ctx);
  if (!canManageProcurementQuotes(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permiso para cargar cotizaciones.");
  const request = await deps.request(input.purchaseRequestId, ctx);
  if (request.projectId !== input.projectId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada en esta obra.");
  if (request.status !== "SUBMITTED") throw new ServiceError("CONFLICT", "La solicitud no admite nuevas cotizaciones.");
  await deps.project(request.projectId, ctx);
  if (!input.bytes.length || input.bytes.length > SUPPLIER_INVOICE_PREVIEW_MAX_BYTES || !(SUPPLIER_INVOICE_PREVIEW_MIME_TYPES as readonly string[]).includes(input.mimeType)) throw new ServiceError("VALIDATION", "Elegí un PDF o imagen de hasta 3 MiB.");
  await deps.sniff(Buffer.from(input.bytes), input.mimeType);
  const config = deps.config();
  const timeout = AbortSignal.timeout(Math.min(config.timeoutMs, 55_000));
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  signal.throwIfAborted();
  return buildProcurementQuoteDocumentPreview(await extractProcurementQuoteDocument({ provider: deps.provider(), model: config.model, mimeType: input.mimeType as SupplierInvoicePreviewMime, bytes: input.bytes, signal }));
}
