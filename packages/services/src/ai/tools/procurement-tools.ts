import { z } from "zod";
import {
  getPurchaseOrderById,
  listPurchaseOrdersByProject,
} from "../../procurement/purchase-order.service";
import { listPurchaseRequestsByProject } from "../../procurement/purchase-request.service";
import { getProjectProcurementHub } from "../../procurement/project-procurement-hub.service";
import { resolveAiProjectId } from "../context";
import { defineBloqerAiTool, nowIso } from "../types";
import { ServiceError } from "../../types";

const searchPrSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const searchPurchaseRequestsTool = defineBloqerAiTool({
  name: "search_purchase_requests",
  description: "Lista solicitudes de compra de un proyecto (filtro opcional por estado).",
  risk: "READ",
  requiredModules: ["PROCUREMENT"],
  inputSchema: searchPrSchema,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      status: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando solicitudes de compra…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const limit = args.limit ?? 20;
    const all = await listPurchaseRequestsByProject(projectId, ctx.service);
    const filtered = args.status ? all.filter((r) => r.status === args.status) : all;
    const rows = filtered.slice(0, limit).map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      code: r.code,
      neededByDate:
        r.neededByDate instanceof Date
          ? r.neededByDate.toISOString().slice(0, 10)
          : (r.neededByDate as string | null),
      href: `/proyectos/${projectId}/solicitudes-compra/${r.id}`,
    }));
    const href = `/proyectos/${projectId}/solicitudes-compra`;
    return {
      data: { total: filtered.length, requests: rows },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      truncation: { total: filtered.length, returned: rows.length },
      ui: { links: [{ label: "Ver solicitudes", href }], summaryLabel: "Consultando solicitudes de compra…" },
    };
  },
});

const searchPoSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.string().optional(),
  pendingApproval: z.boolean().optional(),
  pendingReceipt: z.boolean().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const searchPurchaseOrdersTool = defineBloqerAiTool({
  name: "search_purchase_orders",
  description: "Lista órdenes de compra de un proyecto con filtros de estado / pendientes.",
  risk: "READ",
  requiredModules: ["PROCUREMENT"],
  inputSchema: searchPoSchema,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      status: { type: "string" },
      pendingApproval: { type: "boolean" },
      pendingReceipt: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando órdenes de compra…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const limit = args.limit ?? 20;
    const all = await listPurchaseOrdersByProject(projectId, ctx.service);
    let filtered = all;
    if (args.status) filtered = filtered.filter((o) => o.status === args.status);
    if (args.pendingApproval) filtered = filtered.filter((o) => o.status === "SUBMITTED");
    if (args.pendingReceipt) {
      filtered = filtered.filter((o) =>
        ["CONFIRMED", "PARTIALLY_RECEIVED"].includes(o.status),
      );
    }
    const rows = filtered.slice(0, limit).map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      supplierName: o.supplierName,
      totalAmount: o.totalAmount,
      currency: o.currency,
      href: `/proyectos/${projectId}/ordenes-compra/${o.id}`,
    }));
    const href = `/proyectos/${projectId}/ordenes-compra`;
    return {
      data: { total: filtered.length, orders: rows },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      truncation: { total: filtered.length, returned: rows.length },
      ui: { links: [{ label: "Ver órdenes", href }], summaryLabel: "Consultando órdenes de compra…" },
    };
  },
});

export const getPurchaseOrderTool = defineBloqerAiTool({
  name: "get_purchase_order",
  description: "Detalle de una orden de compra por id.",
  risk: "READ",
  requiredModules: ["PROCUREMENT"],
  inputSchema: z.object({ purchaseOrderId: z.string().uuid() }),
  jsonSchema: {
    type: "object",
    properties: { purchaseOrderId: { type: "string", format: "uuid" } },
    required: ["purchaseOrderId"],
    additionalProperties: false,
  },
  statusLabel: "Consultando orden de compra…",
  async execute(ctx, args) {
    const po = await getPurchaseOrderById(args.purchaseOrderId, ctx.service);
    const href = `/proyectos/${po.projectId}/ordenes-compra/${po.id}`;
    return {
      data: {
        id: po.id,
        code: po.code,
        status: po.status,
        supplierName: po.supplierName,
        totalAmount: po.totalAmount,
        currency: po.currency,
        lineCount: po.lines.length,
        notes: po.notes,
        href,
      },
      provenance: {
        sourceType: "bloqer_data",
        entityType: "PurchaseOrder",
        entityId: po.id,
        route: href,
        asOf: nowIso(),
      },
      ui: { links: [{ label: "Abrir OC", href }] },
    };
  },
});

export const getPendingPurchaseOrdersTool = defineBloqerAiTool({
  name: "get_pending_purchase_orders",
  description: "Resumen de OC pendientes (aprobación / recepción) vía hub de compras + top items.",
  risk: "READ",
  requiredModules: ["PROCUREMENT"],
  inputSchema: z.object({ projectId: z.string().uuid().optional() }),
  jsonSchema: {
    type: "object",
    properties: { projectId: { type: "string", format: "uuid" } },
    additionalProperties: false,
  },
  statusLabel: "Consultando OC pendientes…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const hub = await getProjectProcurementHub(projectId, ctx.service);
    const orders = await listPurchaseOrdersByProject(projectId, ctx.service);
    const pendingApproval = orders
      .filter((o) => o.status === "SUBMITTED")
      .slice(0, 10)
      .map((o) => ({ id: o.id, code: o.code, supplierName: o.supplierName, totalAmount: o.totalAmount, currency: o.currency }));
    const pendingReceipt = orders
      .filter((o) => ["CONFIRMED", "PARTIALLY_RECEIVED"].includes(o.status))
      .slice(0, 10)
      .map((o) => ({ id: o.id, code: o.code, status: o.status, supplierName: o.supplierName }));
    const href = `/proyectos/${projectId}/compras`;
    return {
      data: {
        hub: hub.purchaseOrders,
        pendingApproval,
        pendingReceipt,
      },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      ui: {
        summaryLabel: "Consultando OC pendientes…",
        links: [
          { label: "Hub de compras", href },
          { label: "Órdenes pendientes", href: `/proyectos/${projectId}/ordenes-compra` },
        ],
      },
    };
  },
});
