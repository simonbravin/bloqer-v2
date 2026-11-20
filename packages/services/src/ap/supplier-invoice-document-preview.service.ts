import {
  createAiProviderFromEnv,
  extractSupplierInvoiceDocument,
  getBloqerAiEnv,
  isSupplierInvoicePreviewEnabled,
  SUPPLIER_INVOICE_PREVIEW_MAX_BYTES,
  SUPPLIER_INVOICE_PREVIEW_MIME_TYPES,
  type AiProvider,
  type SupplierInvoiceDocumentExtraction,
  type SupplierInvoiceDocumentPreview,
  type SupplierInvoicePreviewMime,
} from "@bloqer/ai";
import { Prisma } from "@bloqer/database";
import { z } from "zod";
import { ServiceError, type ServiceContext } from "../types";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertUploadContentMatchesDeclaredMime } from "../documents/sniff-upload-content";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";
import { canMutateApForScope } from "./ap-access";
import { resolveCompanyIdForAp } from "./supplier-invoice.service";

/** No entity ids or commands from the model can enter this input. Context comes from session. */
export type SupplierInvoiceDocumentPreviewInput = {
  projectId: string | null;
  mimeType: string;
  bytes: Uint8Array;
  signal?: AbortSignal;
};

type PreviewDependencies = {
  enabled: () => boolean;
  assertModule: typeof assertApTenantModule;
  assertProject: typeof assertProjectAllowsOperationalMutation;
  resolveCompany: typeof resolveCompanyIdForAp;
  provider: () => AiProvider;
  config: typeof getBloqerAiEnv;
};

const defaults: PreviewDependencies = {
  enabled: isSupplierInvoicePreviewEnabled,
  assertModule: assertApTenantModule,
  assertProject: assertProjectAllowsOperationalMutation,
  resolveCompany: resolveCompanyIdForAp,
  provider: createAiProviderFromEnv,
  config: getBloqerAiEnv,
};

/** Advisory UI capability only; POST repeats every flag and authorization check. No network call. */
export function supplierInvoiceDocumentPreviewAvailable(): boolean {
  if (!isSupplierInvoicePreviewEnabled()) return false;
  try {
    const provider = createAiProviderFromEnv();
    return provider.capabilities.supportsVision && provider.capabilities.supportsStructuredOutput;
  } catch {
    return false;
  }
}

/** Calculate only a review verdict using the same line/header kernel as normal AP drafts. */
export function buildSupplierInvoiceDocumentPreview(
  extraction: SupplierInvoiceDocumentExtraction,
): SupplierInvoiceDocumentPreview {
  const { hasUnsupportedTaxes, ...fields } = extraction;
  const blockingReasons: string[] = [];
  const reviewReasons: string[] = [];
  const warnings = [
    "Revisá el original y elegí el proveedor manualmente; la lectura puede contener errores.",
    "La referencia fiscal es informativa: no se guarda como número fiscal ni verifica duplicados. Revisá el listado antes de crear el borrador.",
  ];
  if (fields.documentKind !== "INVOICE") {
    blockingReasons.push("Este piloto admite solo facturas normales; notas de crédito, débito y otros documentos requieren carga manual.");
  }
  if (fields.currency !== "ARS") blockingReasons.push("La moneda debe estar identificada como ARS; moneda extranjera o desconocida requiere carga manual.");
  if (!fields.invoiceLetter) reviewReasons.push("Seleccioná la letra de la factura.");
  if (!fields.issueDate) reviewReasons.push("Completá la fecha de emisión.");
  if (!fields.dueDate) reviewReasons.push("Completá la fecha de vencimiento.");
  if (fields.pricesIncludeTax === null) reviewReasons.push("Indicá si los precios unitarios incluyen IVA.");
  if (hasUnsupportedTaxes === true) blockingReasons.push("Hay impuestos, cargos o descuentos globales no soportados. Usá carga manual y revisá cómo registrarlos.");
  if (hasUnsupportedTaxes === null) reviewReasons.push("Verificá en el original si hay otros impuestos, cargos o descuentos globales. Si los hay, continuá por carga manual.");
  const requiredAmounts = [
    ["iibbPerceptionRate", "alícuota IIBB"], ["iibbPerceptionAmount", "importe IIBB"],
    ["subtotal", "subtotal"], ["taxTotal", "IVA total"], ["total", "total final"],
  ] as const;
  for (const [key, label] of requiredAmounts) {
    if (fields[key] === null) reviewReasons.push(`Revisá ${label} en el original: no se pudo leer. Un dato ausente no equivale a cero.`);
  }
  if (!fields.lines.length) blockingReasons.push("No se identificaron renglones dentro del alcance del piloto (máximo 80).");
  fields.lines.forEach((line, i) => {
    const missing = [
      ["description", "descripción"], ["quantity", "cantidad"], ["unitPrice", "precio unitario"],
      ["taxRate", "alícuota IVA"], ["discountPercent", "descuento"],
    ] as const;
    const missingLabels = missing.filter(([key]) => line[key] === null).map(([, label]) => label);
    if (missingLabels.length) reviewReasons.push(`Línea ${i + 1}: completá ${missingLabels.join(", ")}.`);
    if (line.quantity !== null && new Prisma.Decimal(line.quantity).lessThanOrEqualTo(0)) {
      blockingReasons.push(`Línea ${i + 1}: la cantidad debe ser mayor a cero.`);
    }
    if (line.discountPercent !== null && new Prisma.Decimal(line.discountPercent).greaterThan(100)) {
      blockingReasons.push(`Línea ${i + 1}: el descuento excede el rango permitido.`);
    }
    if ((fields.invoiceLetter === "C" || fields.invoiceLetter === "E") &&
      (fields.pricesIncludeTax === true || (line.taxRate !== null && !new Prisma.Decimal(line.taxRate).isZero()))) {
      blockingReasons.push(`Línea ${i + 1}: la letra C/E no admite IVA; revisá la lectura manualmente.`);
    }
  });

  // Printed header arithmetic is independently verifiable even if a line was unreadable.
  // Reuse the same one-cent comparison; missing taxes are never substituted with zero.
  if (blockingReasons.length === 0 && fields.subtotal !== null && fields.taxTotal !== null &&
    fields.iibbPerceptionAmount !== null && fields.total !== null) {
    const printedSum = new Prisma.Decimal(fields.subtotal).plus(fields.taxTotal).plus(fields.iibbPerceptionAmount);
    if (printedSum.minus(fields.total).abs().greaterThan("0.01")) {
      blockingReasons.push("El subtotal, IVA e IIBB leídos no suman el total del comprobante; revisá el original por carga manual.");
    }
  }

  // Compare every verifiable amount even when a nonfinancial header/printed total is missing.
  // Unknown inputs never enter the kernel as guessed zeros.
  const canCalculateLines = fields.pricesIncludeTax !== null && fields.lines.length > 0 &&
    fields.lines.every((line) => line.quantity !== null && line.unitPrice !== null && line.taxRate !== null && line.discountPercent !== null);
  if (blockingReasons.length === 0 && canCalculateLines) {
    const calculated = fields.lines.map((line) => resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal(line.quantity!),
      unitPrice: new Prisma.Decimal(line.unitPrice!),
      taxRate: new Prisma.Decimal(line.taxRate!),
      discountPct: new Prisma.Decimal(line.discountPercent!),
      pricesIncludeTax: fields.pricesIncludeTax!,
    }));
    const subtotal = calculated.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0));
    const taxAmount = calculated.reduce((sum, line) => sum.plus(line.lineTax), new Prisma.Decimal(0));
    const totals = fields.iibbPerceptionRate === null ? null : headerTotalsWithIibbPerception({
      lineSubtotals: calculated.map((line) => line.lineSubtotal),
      lineTaxes: calculated.map((line) => line.lineTax),
      iibbPerceptionRate: new Prisma.Decimal(fields.iibbPerceptionRate!),
    });
    for (const [label, computed, printed] of [
      ["subtotal", subtotal, fields.subtotal],
      ["IVA", taxAmount, fields.taxTotal],
      ["IIBB", totals?.iibbPerceptionAmount, fields.iibbPerceptionAmount],
      ["total", totals?.totalAmount, fields.total],
    ] as const) {
      if (computed == null || printed === null) continue;
      const difference = computed.minus(printed).abs();
      if (difference.greaterThan("0.01")) {
        blockingReasons.push(`El ${label} calculado (${computed.toFixed(2)}) difiere del leído (${printed}); no se aplican ajustes automáticos.`);
      } else if (!difference.isZero()) {
        warnings.push(`El ${label} calculado (${computed.toFixed(2)}) difiere en un centavo del leído (${printed}). El borrador usará el cálculo habitual de Bloqer.`);
      }
    }
  }
  if (!canCalculateLines || fields.iibbPerceptionRate === null || fields.total === null) {
    reviewReasons.push("Todavía no se puede cotejar el total: completá los importes y compará el cálculo del formulario con el original antes de guardar.");
  }
  return { ...fields, warnings, reviewReasons, canApply: blockingReasons.length === 0, blockingReasons };
}

/**
 * ADR-019: authorized, ephemeral extraction. This service has no creation/issue/payment
 * path. Injectable boundaries support fake tests without DB or external documents.
 */
export async function previewSupplierInvoiceDocument(
  input: SupplierInvoiceDocumentPreviewInput,
  ctx: ServiceContext,
  dependencies: PreviewDependencies = defaults,
): Promise<SupplierInvoiceDocumentPreview> {
  if (!dependencies.enabled()) throw new ServiceError("FORBIDDEN", "La lectura de comprobantes con IA no está habilitada.");
  if (!ctx.actorUserId || !ctx.tenantId) throw new ServiceError("UNAUTHORIZED", "Sesión requerida.");
  const projectResult = z.string().guid().nullable().safeParse(input.projectId);
  if (!projectResult.success) throw new ServiceError("VALIDATION", "Proyecto inválido.");
  const projectId = projectResult.data;
  await dependencies.assertModule(ctx);
  if (!canMutateApForScope(ctx.roles, projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para preparar facturas de proveedor.");
  }
  if (projectId) await dependencies.assertProject(projectId, ctx);
  await dependencies.resolveCompany(projectId, ctx);

  if (input.bytes.byteLength === 0 || input.bytes.byteLength > SUPPLIER_INVOICE_PREVIEW_MAX_BYTES) {
    throw new ServiceError("VALIDATION", "Elegí un comprobante de hasta 3 MiB.");
  }
  if (!(SUPPLIER_INVOICE_PREVIEW_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new ServiceError("VALIDATION", "Este piloto admite PDF, JPEG, PNG o WebP.");
  }
  try {
    await assertUploadContentMatchesDeclaredMime(Buffer.from(input.bytes), input.mimeType);
  } catch {
    throw new ServiceError("VALIDATION", "El contenido del archivo no coincide con un PDF, JPEG, PNG o WebP válido.");
  }
  const config = dependencies.config();
  // AbortSignal timeout bounds the single provider call; cancellation never creates a draft.
  const timeout = AbortSignal.timeout(Math.min(config.timeoutMs, 60_000));
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const extraction = await extractSupplierInvoiceDocument({
    provider: dependencies.provider(), model: config.model,
    mimeType: input.mimeType as SupplierInvoicePreviewMime,
    bytes: input.bytes, signal,
  });
  return buildSupplierInvoiceDocumentPreview(extraction);
}
