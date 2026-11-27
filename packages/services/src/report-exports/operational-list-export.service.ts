import { fiscalDocumentKindLabel, isFiscalDocumentKind } from "@bloqer/domain";
import { getProjectShellInfo } from "../project/project.service";
import {
  listSupplierInvoicesByProject,
  listCompanySupplierInvoices,
  type CompanySupplierInvoiceListFilters,
} from "../ap/supplier-invoice.service";
import { listInvoicesByProject } from "../ar/sales-invoice.service";
import { listPurchaseOrdersByProject } from "../procurement/purchase-order.service";
import { listPurchaseRequestsByProject } from "../procurement/purchase-request.service";
import { listReceiptsByProject } from "../procurement/purchase-receipt.service";
import { listPaymentsByProject } from "../ap/payment.service";
import { listCollectionsByProject } from "../treasury/collection.service";
import type { ServiceContext } from "../types";
import {
  assertOperationalExportLimit,
  collectOperationalExportPages,
  matchesOperationalListStatus,
  normalizeOperationalListSearch,
} from "./operational-list-export-pure";
import { buildXlsxSheet } from "./xlsx-export.service";
import { safeReportFilename } from "./filename.service";
import type { ReportXlsxPayload } from "./report-export.types";

export type ProjectOperationalListKind =
  | "supplier-invoices"
  | "sales-invoices"
  | "purchase-orders"
  | "purchase-requests"
  | "purchase-receipts"
  | "payments"
  | "collections";
export type OperationalListExportParams = Record<string, string | undefined>;
export type OperationalListExportTable = {
  title: string;
  filenameBase: string;
  projectLabel: string;
  filterLine: string;
  columns: { key: string; label: string; flex?: number }[];
  rows: Record<string, string>[];
};

const INVOICE_STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;
const ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CONFIRMED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
const REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "QUOTE_SELECTED",
  "COMPLETED",
  "CANCELLED",
] as const;
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  CANCELLED: "Anulada",
  SUBMITTED: "Enviada",
  APPROVED: "Aprobada",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Recepción parcial",
  RECEIVED: "Recibida",
  QUOTE_SELECTED: "Adjudicada",
  COMPLETED: "Completada",
  OPEN: "Pendiente",
  PARTIAL: "Parcialmente pagada",
  PAID: "Saldada",
  OVERDUE: "Vencida",
};
const TITLES: Record<ProjectOperationalListKind, [string, string]> = {
  "supplier-invoices": ["Facturas proveedor", "facturas_proveedor"],
  "sales-invoices": ["Facturas emitidas", "facturas_emitidas"],
  "purchase-orders": ["Órdenes de compra", "ordenes_compra"],
  "purchase-requests": ["Solicitudes de compra", "solicitudes_compra"],
  "purchase-receipts": ["Recepciones", "recepciones"],
  payments: ["Pagos", "pagos"],
  collections: ["Cobranzas", "cobranzas"],
};
function selectedStatus<T extends string>(
  value: string | undefined,
  valid: readonly T[],
): T | undefined {
  return valid.includes(value as T) ? (value as T) : undefined;
}
function date(value: Date | string | null): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : (value?.slice(0, 10) ?? "");
}
function label(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
function columns(items: [string, string, number?][]): OperationalListExportTable["columns"] {
  return items.map(([key, label, flex]) => ({ key, label, flex }));
}

/** Existing services enforce module, role, tenant, company, project access and parent integrity. */
export async function buildProjectOperationalListExport(
  projectId: string,
  kind: ProjectOperationalListKind,
  sp: OperationalListExportParams,
  ctx: ServiceContext,
): Promise<OperationalListExportTable> {
  const [title, filename] = TITLES[kind];
  let tableColumns: OperationalListExportTable["columns"];
  let rows: OperationalListExportTable["rows"];
  const filters: string[] = [];
  const search = sp.search?.trim();
  if (search && kind !== "purchase-receipts" && kind !== "payments" && kind !== "collections")
    filters.push(`Búsqueda: ${search}`);

  if (kind === "supplier-invoices" || kind === "sales-invoices") {
    const documentKind = isFiscalDocumentKind(sp.kind) ? sp.kind : undefined;
    if (documentKind) filters.push(`Tipo: ${fiscalDocumentKindLabel(documentKind)}`);
    if (sp.class) filters.push(`Clase: ${sp.class}`);
    const common = { search, class: sp.class, documentKind };
    tableColumns = columns([
      ["code", "Código", 0.7],
      ["letter", "Letra", 0.4],
      ["kind", "Tipo", 0.9],
      ["party", kind === "supplier-invoices" ? "Proveedor" : "Cliente", 1.2],
      ["class", "Clase", 1.1],
      ["issue", "Emisión", 0.7],
      ["due", "Vencimiento", 0.7],
      ["status", "Estado", 0.7],
      ["currency", "Moneda", 0.45],
      ["total", "Total", 0.8],
    ]);
    if (kind === "supplier-invoices") {
      const status = selectedStatus(sp.status, INVOICE_STATUSES);
      filters.push(`Estado: ${status ? label(status) : "Activas"}`);
      const data = await collectOperationalExportPages((pagination) =>
        listSupplierInvoicesByProject(projectId, ctx, {
          ...common,
          ...pagination,
          status,
          sortDir: sp.dir === "asc" ? "asc" : "desc",
        }),
      );
      tableColumns.push({ key: "paymentStatus", label: "Estado de pago", flex: 0.8 });
      rows = data.map((inv) => ({
        code: inv.code,
        letter: inv.invoiceLetter ?? "",
        kind: fiscalDocumentKindLabel(inv.documentKind),
        party: inv.supplierName,
        class: inv.classLabel,
        issue: date(inv.issueDate),
        due: date(inv.dueDate),
        status: label(inv.status),
        currency: inv.currency,
        total: inv.totalAmount,
        paymentStatus: inv.payable ? label(inv.payable.status) : "",
      }));
    } else {
      filters.push("Estado: Activas");
      const data = await collectOperationalExportPages((pagination) =>
        listInvoicesByProject(projectId, ctx, { ...common, ...pagination }),
      );
      rows = data.map((inv) => ({
        code: inv.code,
        letter: inv.invoiceLetter ?? "",
        kind: fiscalDocumentKindLabel(inv.documentKind),
        party: inv.clientName,
        class: inv.classLabel,
        issue: date(inv.issueDate),
        due: date(inv.dueDate),
        status: label(inv.status),
        currency: inv.currency,
        total: inv.totalAmount,
      }));
    }
  } else if (kind === "purchase-orders") {
    const status = selectedStatus(sp.status, ORDER_STATUSES);
    filters.push(`Estado: ${status ? label(status) : "Activas"}`);
    const q = normalizeOperationalListSearch(search ?? "");
    const data = (await listPurchaseOrdersByProject(projectId, ctx)).filter(
      (order) =>
        matchesOperationalListStatus(order.status, status) &&
        (!q ||
          normalizeOperationalListSearch(
            `${order.code} ${order.supplierName} ${order.approvedByName ?? ""}`,
          ).includes(q)),
    );
    assertOperationalExportLimit(data.length);
    tableColumns = columns([
      ["code", "Código", 0.7],
      ["supplier", "Proveedor", 1.4],
      ["issue", "Emisión", 0.8],
      ["delivery", "Entrega prevista", 0.8],
      ["status", "Estado", 1],
      ["approvedBy", "Aprobador", 1],
      ["currency", "Moneda", 0.5],
      ["total", "Total", 0.9],
    ]);
    rows = data.map((order) => ({
      code: order.code,
      supplier: order.supplierName,
      issue: date(order.issueDate),
      delivery: date(order.expectedDeliveryDate),
      status: order.status === "SUBMITTED" ? "Pend. aprobación" : label(order.status),
      approvedBy: order.approvedByName ?? "",
      currency: order.currency,
      total: order.totalAmount,
    }));
  } else if (kind === "purchase-requests") {
    const status = selectedStatus(sp.status, REQUEST_STATUSES);
    filters.push(`Estado: ${status ? label(status) : "Activas"}`);
    const q = normalizeOperationalListSearch(search ?? "");
    const data = (await listPurchaseRequestsByProject(projectId, ctx)).filter((request) => {
      const haystack = [
        request.code,
        request.selectedSupplierName,
        request.requestedByName,
        request.primaryWbsNodeCode,
        request.primaryWbsNodeName,
        ...request.lines.flatMap((line) => [line.description, line.wbsNodeCode, line.wbsNodeName]),
      ]
        .filter(Boolean)
        .join(" ");
      return (
        matchesOperationalListStatus(request.status, status) &&
        (!q || normalizeOperationalListSearch(haystack).includes(q))
      );
    });
    assertOperationalExportLimit(data.length);
    tableColumns = columns([
      ["code", "Código", 0.7],
      ["status", "Estado", 0.7],
      ["description", "Descripción", 1.2],
      ["wbs", "EDT", 0.7],
      ["amount", "Monto estimado", 0.9],
      ["currency", "Moneda", 0.5],
      ["source", "Origen estimación", 0.8],
      ["supplier", "Proveedor", 1],
      ["requestedBy", "Solicitante", 1],
      ["neededBy", "Necesaria para", 0.8],
    ]);
    rows = data.map((request) => ({
      code: request.code,
      status: label(request.status),
      description: request.lines.map((line) => line.description).join("; "),
      wbs: [...new Set(request.lines.map((line) => line.wbsNodeCode).filter(Boolean))].join(", "),
      amount: request.estimatedAmount ?? "",
      currency: request.estimatedAmountCurrency ?? "",
      source:
        request.estimatedAmountSource === "budget"
          ? "Presupuesto"
          : request.estimatedAmountSource === "quote"
            ? "Cotización"
            : request.estimatedAmountSource === "orders"
              ? "Órdenes de compra"
              : "",
      supplier: request.selectedSupplierName ?? "",
      requestedBy: request.requestedByName ?? "",
      neededBy: date(request.neededByDate),
    }));
  } else if (kind === "purchase-receipts") {
    const data = await listReceiptsByProject(projectId, ctx);
    assertOperationalExportLimit(data.length);
    tableColumns = columns([
      ["code", "Código", 1.5],
      ["order", "Orden de compra", 0.8],
      ["supplier", "Proveedor", 1.2],
      ["date", "Fecha", 0.7],
      ["status", "Estado", 0.8],
      ["receivedBy", "Recibido por", 1],
      ["lines", "Ítems", 0.4],
    ]);
    rows = data.map((receipt) => ({
      code: receipt.code,
      order: receipt.purchaseOrderCode,
      supplier: receipt.supplierName,
      date: date(receipt.receiptDate),
      status: label(receipt.status),
      receivedBy: receipt.receivedByName ?? "",
      lines: String(receipt.lines.length),
    }));
  } else {
    tableColumns = columns([
      ["id", "Identificador", 1.4],
      ["date", "Fecha", 0.8],
      ["account", "Cuenta", 1.3],
      ["status", "Estado", 0.8],
      ["currency", "Moneda", 0.5],
      ["amount", "Monto", 0.9],
      ["notes", "Notas", 1.3],
    ]);
    if (kind === "payments") {
      const data = await collectOperationalExportPages((pagination) =>
        listPaymentsByProject(projectId, ctx, pagination),
      );
      rows = data.map((payment) => ({
        id: payment.id,
        date: date(payment.paymentDate),
        account: payment.accountName,
        status: payment.status === "CANCELLED" ? "Cancelado" : "Confirmado",
        currency: payment.currency,
        amount: payment.amount,
        notes: payment.notes ?? "",
      }));
    } else {
      const data = await collectOperationalExportPages((pagination) =>
        listCollectionsByProject(projectId, ctx, pagination),
      );
      rows = data.map((collection) => ({
        id: collection.id,
        date: date(collection.collectionDate),
        account: collection.accountName,
        status: collection.status === "CANCELLED" ? "Cancelada" : "Confirmada",
        currency: collection.currency,
        amount: collection.amount,
        notes: collection.notes ?? "",
      }));
    }
  }
  const project = await getProjectShellInfo(projectId, ctx);
  return {
    title,
    filenameBase: `${filename}_${project.code}`,
    projectLabel: `${project.code} · ${project.name}`,
    filterLine: filters.join(" · "),
    columns: tableColumns,
    rows,
  };
}

export async function exportProjectOperationalListXlsx(
  projectId: string,
  kind: ProjectOperationalListKind,
  sp: OperationalListExportParams,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const table = await buildProjectOperationalListExport(projectId, kind, sp, ctx);
  return {
    buffer: buildXlsxSheet(
      table.columns.map((column) => column.label),
      table.rows.map((row) => table.columns.map((column) => row[column.key] ?? "")),
      {
        sheetName: table.title,
        preamble: [
          [table.title],
          [table.projectLabel],
          [table.filterLine],
          [`${table.rows.length} registros`],
        ],
      },
    ),
    filename: safeReportFilename(table.filenameBase, "xlsx"),
  };
}

export function readCompanySupplierInvoicesForExport(
  filters: CompanySupplierInvoiceListFilters,
  ctx: ServiceContext,
) {
  return collectOperationalExportPages((pagination) =>
    listCompanySupplierInvoices(ctx, { ...filters, ...pagination }),
  );
}
