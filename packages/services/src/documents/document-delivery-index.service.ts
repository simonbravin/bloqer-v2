import { z } from "zod";
import { prisma, type Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { listProjectDocumentsSchema } from "@bloqer/validators";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { resolveUserDisplayNames } from "../user/resolve-user-display-names";
import { buildCsv } from "../report-exports/csv-export.service";
import { buildXlsxWorkbook } from "../report-exports/xlsx-export.service";
import { canViewDocumentByLink, resolveDocumentLinkScopes } from "./document-link-scope";
import { buildDocumentDeliveryRows, documentDeliveryTable, DOCUMENT_DELIVERY_CATEGORY_LABELS } from "./document-delivery-index-pure";

const MAX_DOCUMENTS = 10_000;
const PAGE_SIZE = 25;
const inputSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).optional().default("ACTIVE"),
  category: z.union([listProjectDocumentsSchema.shape.category.unwrap(), z.literal("")]).optional().default(""),
  page: z.coerce.number().int().min(1).max(1_000_000).optional().default(1),
});

export type DocumentDeliveryParams = { search?: string; status?: string; category?: string; page?: string | number };

const select = {
  id: true, tenantId: true, companyId: true, projectId: true, folderId: true,
  originalFileName: true, category: true, status: true, storageProvider: true, sizeBytes: true,
  uploadedBy: true, createdAt: true, linkedEntityType: true, linkedEntityId: true, replacesAttachmentId: true,
} as const;

/** Metadata only. No object reads, signed URLs, folder backfill or mutations. */
async function readDocumentDeliveryIndex(projectId: string, params: DocumentDeliveryParams, ctx: ServiceContext) {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) throw new ServiceError("FORBIDDEN", "Sin permisos para ver documentos");
  const project = await requireProjectAccess(projectId, ctx);
  const parsed = inputSchema.safeParse(params);
  if (!parsed.success) throw new ServiceError("VALIDATION", "Filtros del índice documental inválidos");
  const filters = parsed.data;
  const scope: Prisma.DocumentAttachmentWhereInput = {
    tenantId: ctx.tenantId, projectId,
    AND: [companyScopeFilter(ctx), { OR: [{ folderId: null }, { folder: { tenantId: ctx.tenantId, projectId } }] }],
  };
  const documents = await prisma.documentAttachment.findMany({
    where: { AND: [scope, {
      status: filters.status === "ALL" ? { in: ["ACTIVE", "ARCHIVED"] } : filters.status,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search ? { OR: [
        { originalFileName: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ] } : {}),
    }] },
    select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_DOCUMENTS + 1,
  });
  if (documents.length > MAX_DOCUMENTS) throw new ServiceError("CONFLICT", "El índice supera los 10.000 archivos. Acotá la búsqueda o categoría; no se generó un índice incompleto.");

  const authorize = async (rows: typeof documents) => {
    const readable = rows.filter((doc) => canViewDocumentByLink(doc.linkedEntityType, ctx.roles, projectId));
    const scoped = await resolveDocumentLinkScopes(readable, [project], ctx.tenantId);
    return scoped.filter(({ scope: target }) => !isCrossCompany(target.companyId, ctx))
      .map(({ doc, scope: target }) => ({ ...doc, effectiveCompanyId: target.companyId }));
  };
  const visible = await authorize(documents);
  const ids = visible.map((doc) => doc.id);
  const previousIds = visible.flatMap((doc) => doc.replacesAttachmentId ? [doc.replacesAttachmentId] : []);
  const adjacent = ids.length ? await prisma.documentAttachment.findMany({
    where: { AND: [scope, { status: { in: ["ACTIVE", "ARCHIVED"] }, OR: [
      { id: { in: previousIds } }, { replacesAttachmentId: { in: ids } },
    ] }] }, select, take: MAX_DOCUMENTS * 2 + 1,
  }) : [];
  if (adjacent.length > MAX_DOCUMENTS * 2) throw new ServiceError("CONFLICT", "No se pudo completar la relación de revisiones. Acotá la búsqueda.");
  const authorizedAdjacent = await authorize(adjacent);
  const names = await resolveUserDisplayNames(visible.map((doc) => doc.uploadedBy), ctx);
  const rows = buildDocumentDeliveryRows(visible, authorizedAdjacent, names);
  const label = await prisma.project.findFirstOrThrow({ where: { id: projectId, tenantId: ctx.tenantId }, select: { code: true, name: true } });
  const filterLine = `${label.code} · ${label.name} · ${filters.status === "ALL" ? "Activos y archivados" : filters.status === "ACTIVE" ? "Activos" : "Archivados"}${filters.category ? ` · ${DOCUMENT_DELIVERY_CATEGORY_LABELS[filters.category]}` : ""}${filters.search ? ` · Búsqueda: ${filters.search}` : ""}`;
  return { projectId, projectCode: label.code, projectName: label.name, rows, filters, filterLine, generatedAt: new Date().toISOString() };
}

export async function getProjectDocumentDeliveryIndex(projectId: string, params: DocumentDeliveryParams, ctx: ServiceContext) {
  const data = await readDocumentDeliveryIndex(projectId, params, ctx);
  const total = data.rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(data.filters.page, pages);
  return { ...data, rows: data.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, page, pages, pageSize: PAGE_SIZE,
    originalsRegistered: data.rows.filter((row) => row.originalRegistered).length };
}

export async function buildProjectDocumentDeliveryExport(projectId: string, params: DocumentDeliveryParams, ctx: ServiceContext) {
  const data = await readDocumentDeliveryIndex(projectId, params, ctx);
  return { ...data, table: documentDeliveryTable(data.rows, projectId) };
}

export async function exportProjectDocumentDeliveryIndex(projectId: string, params: DocumentDeliveryParams, format: "csv" | "xlsx", ctx: ServiceContext) {
  const data = await buildProjectDocumentDeliveryExport(projectId, params, ctx);
  const filename = `indice-entrega-${projectId}.${format}`;
  if (format === "csv") return { filename, content: buildCsv(data.table.headers, data.table.rows), buffer: null };
  return { filename, content: null, buffer: buildXlsxWorkbook([{ sheetName: "Índice de entrega", ...data.table,
    preamble: [["Índice de entrega"], [data.filterLine], ["Generado UTC", data.generatedAt],
      ["Original registrado indica una carga confirmada; la integridad se comprueba desde el historial del archivo."],
      ["Las rutas requieren iniciar sesión en Bloqer. El índice no incluye los archivos originales."]],
  }]) };
}
