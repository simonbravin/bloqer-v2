import { prisma } from "@bloqer/database";
import type { JournalEntrySourceType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewApProjectArea, canViewCompanyAp } from "../ap/ap-access";
import { canViewArProjectArea } from "../ar/ar-access";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext } from "../types";

/** Read-only traceability for journal detail (Phase 11D). No mutations. */
export type JournalEntrySourceLink = {
  /** Short heading, e.g. "Cobranza" */
  kindLabel: string;
  /** Human detail (date, amount, etc.) */
  detail: string;
  /** App Router path, or null if user cannot access or no deep link */
  href: string | null;
  /** Shown when href is null but a source was resolved */
  noAccessHint: string | null;
};

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoneyAr(amount: { toString(): string }, currency: string): string {
  const n = parseFloat(amount.toString());
  const num = Number.isFinite(n)
    ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount.toString();
  return `${num} ${currency}`;
}

function treasuryMovimientosHref(accountId: string, movementDate: Date): string {
  const d = fmtDate(movementDate);
  const q = new URLSearchParams({ accountId, dateFrom: d, dateTo: d });
  return `/tesoreria/movimientos?${q.toString()}`;
}

async function resolvedTreasuryMovementCompanyId(
  m: { companyId: string | null; accountId: string },
  tenantId: string,
): Promise<string | null> {
  if (m.companyId) return m.companyId;
  const acc = await prisma.treasuryAccount.findFirst({
    where: { id: m.accountId, tenantId },
    select: { companyId: true },
  });
  return acc?.companyId ?? null;
}

/**
 * Resolves a safe label and optional internal link for a journal's operational source.
 * Enforces tenant module ACCOUNTING (throws if disabled); without VIEW ACCOUNTING returns null (legacy RBAC).
 */
export async function getJournalEntrySourceLink(
  ctx: ServiceContext,
  params: {
    sourceType: JournalEntrySourceType;
    sourceId:   string | null;
    companyId:  string;
  },
): Promise<JournalEntrySourceLink | null> {
  const { sourceType, sourceId, companyId } = params;
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "ACCOUNTING")) return null;
  if (!sourceId || sourceId.trim() === "") return null;
  if (sourceType === "MANUAL") return null;

  const noAr = "Necesitás permiso de AR o Proyectos para abrir el enlace.";
  const noAp = "Necesitás permiso de AP o Proyectos para abrir el enlace.";
  const noTr = "Necesitás permiso de Tesorería para abrir el enlace.";
  const noInv = "Necesitás permiso de Inventario para abrir el enlace.";

  switch (sourceType) {
    case "COLLECTION": {
      const c = await prisma.collection.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!c || c.companyId !== companyId) {
        return {
          kindLabel: "Cobranza",
          detail:    "Documento origen no encontrado o no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      const detail = `${fmtDate(c.collectionDate)} · ${fmtMoneyAr(c.amount, c.currency)}`;
      const canLink = canViewArProjectArea(ctx.roles);
      return {
        kindLabel: "Cobranza",
        detail,
        href:      canLink ? `/proyectos/${c.projectId}/cobranzas/${c.id}` : null,
        noAccessHint: canLink ? null : noAr,
      };
    }
    case "PAYMENT": {
      const p = await prisma.payment.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!p || p.companyId !== companyId) {
        return {
          kindLabel: "Pago",
          detail:    "Documento origen no encontrado o no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      const detail = `${fmtDate(p.paymentDate)} · ${fmtMoneyAr(p.amount, p.currency)}`;
      const href =
        p.projectId && canViewApProjectArea(ctx.roles)
          ? `/proyectos/${p.projectId}/pagos/${p.id}`
          : !p.projectId && canViewCompanyAp(ctx.roles)
            ? `/finanzas/pagos-proveedor/${p.id}`
            : null;
      return {
        kindLabel: "Pago a proveedor",
        detail,
        href,
        noAccessHint: href ? null : noAp,
      };
    }
    case "TREASURY_INFLOW":
    case "TREASURY_OUTFLOW": {
      const m = await prisma.accountMovement.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!m) {
        return {
          kindLabel: sourceType === "TREASURY_INFLOW" ? "Tesorería — ingreso" : "Tesorería — egreso",
          detail:    "Movimiento no encontrado.",
          href:      null,
          noAccessHint: null,
        };
      }
      const resolvedCo = await resolvedTreasuryMovementCompanyId(m, ctx.tenantId);
      if (resolvedCo !== companyId) {
        return {
          kindLabel: sourceType === "TREASURY_INFLOW" ? "Tesorería — ingreso" : "Tesorería — egreso",
          detail:    "El movimiento no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      const detail = `${fmtDate(m.movementDate)} · ${m.description.slice(0, 120)}${m.description.length > 120 ? "…" : ""}`;
      const canLink = can(ctx.roles, "VIEW", "TREASURY");
      return {
        kindLabel: sourceType === "TREASURY_INFLOW" ? "Tesorería — ingreso" : "Tesorería — egreso",
        detail,
        href:      canLink ? treasuryMovimientosHref(m.accountId, m.movementDate) : null,
        noAccessHint: canLink ? null : noTr,
      };
    }
    case "INTERNAL_TRANSFER": {
      let transferId = sourceId;
      const direct = await prisma.internalTransfer.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!direct) {
        const mov = await prisma.accountMovement.findFirst({
          where: { id: sourceId, tenantId: ctx.tenantId },
          select: { transferId: true },
        });
        if (mov?.transferId) transferId = mov.transferId;
        else {
          return {
            kindLabel: "Transferencia interna",
            detail:    "Transferencia o movimiento no encontrado.",
            href:      null,
            noAccessHint: null,
          };
        }
      }
      const tr = await prisma.internalTransfer.findFirst({
        where: { id: transferId, tenantId: ctx.tenantId },
      });
      if (!tr || tr.companyId !== companyId) {
        return {
          kindLabel: "Transferencia interna",
          detail:    "Transferencia no encontrada o no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      const detail = `${fmtDate(tr.transferDate)} · ${fmtMoneyAr(tr.amount, tr.currency)}`;
      const canLink = can(ctx.roles, "VIEW", "TREASURY");
      return {
        kindLabel: "Transferencia interna",
        detail,
        href:      canLink ? "/tesoreria/transferencias" : null,
        noAccessHint: canLink ? null : noTr,
      };
    }
    case "STOCK_MOVEMENT": {
      const sm = await prisma.stockMovement.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
        include: { product: { select: { name: true } } },
      });
      if (!sm || sm.companyId !== companyId) {
        return {
          kindLabel: "Movimiento de stock",
          detail:    "Movimiento no encontrado o no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { baseCurrency: true },
      });
      const cur = tenant?.baseCurrency ?? "ARS";
      const cost = sm.totalCost ?? sm.unitCost;
      const costStr = cost ? fmtMoneyAr(cost, cur) : "—";
      const detail = `${fmtDate(sm.movementDate)} · ${sm.type} · ${sm.product.name} · costo ${costStr}`;
      const canInv = can(ctx.roles, "VIEW", "INVENTORY");
      let href: string | null = null;
      if (canInv) {
        href = sm.projectId
          ? `/proyectos/${sm.projectId}/inventario`
          : "/inventario/movimientos";
      }
      return {
        kindLabel: "Movimiento de stock",
        detail,
        href,
        noAccessHint: canInv ? null : noInv,
      };
    }
    case "SALES_INVOICE": {
      const inv = await prisma.salesInvoice.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!inv || inv.companyId !== companyId) {
        return { kindLabel: "Factura de venta", detail: "Factura no encontrada.", href: null, noAccessHint: null };
      }
      const detail = `Factura #${inv.number} · ${fmtDate(inv.issueDate)}`;
      const canLink = canViewArProjectArea(ctx.roles);
      return {
        kindLabel: "Factura de venta",
        detail,
        href:      canLink ? `/proyectos/${inv.projectId}/facturas/${inv.id}` : null,
        noAccessHint: canLink ? null : noAr,
      };
    }
    case "SUPPLIER_INVOICE": {
      const inv = await prisma.supplierInvoice.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!inv || inv.companyId !== companyId) {
        return { kindLabel: "Factura de proveedor", detail: "Factura no encontrada.", href: null, noAccessHint: null };
      }
      const detail = `Factura proveedor #${inv.number} · ${fmtDate(inv.issueDate)}`;
      const href =
        inv.projectId && canViewApProjectArea(ctx.roles)
          ? `/proyectos/${inv.projectId}/facturas-proveedor/${inv.id}`
          : !inv.projectId && canViewCompanyAp(ctx.roles)
            ? `/finanzas/facturas-proveedor/${inv.id}`
            : null;
      return {
        kindLabel: "Factura de proveedor",
        detail,
        href,
        noAccessHint: href ? null : noAp,
      };
    }
    case "ADJUSTMENT": {
      const m = await prisma.accountMovement.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      if (!m) {
        return { kindLabel: "Ajuste de tesorería", detail: "Movimiento no encontrado.", href: null, noAccessHint: null };
      }
      const resolvedCo = await resolvedTreasuryMovementCompanyId(m, ctx.tenantId);
      if (resolvedCo !== companyId) {
        return {
          kindLabel: "Ajuste de tesorería",
          detail:    "El movimiento no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      const detail = `${fmtDate(m.movementDate)} · ${m.description.slice(0, 120)}${m.description.length > 120 ? "…" : ""}`;
      const canLink = can(ctx.roles, "VIEW", "TREASURY");
      return {
        kindLabel: "Ajuste de tesorería",
        detail,
        href:      canLink ? treasuryMovimientosHref(m.accountId, m.movementDate) : null,
        noAccessHint: canLink ? null : noTr,
      };
    }
    default: {
      return {
        kindLabel: String(sourceType),
        detail:    "Tipo de origen sin enlace profundo configurado.",
        href:      null,
        noAccessHint: null,
      };
    }
  }
}
