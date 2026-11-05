import { prisma } from "@bloqer/database";
import type { JournalEntrySourceType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { formatDbDate, formatGroupedDecimal } from "@bloqer/utils";
import { isCrossCompany } from "../company-scope";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext } from "../types";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { canViewJournalSource } from "./accounting-source-access";

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
  return formatDbDate(d);
}

function fmtMoneyAr(amount: { toString(): string }, currency: string): string {
  return `${formatGroupedDecimal(serializeMoneyDecimal(amount), 2)} ${currency}`;
}

function hiddenSource(kindLabel: string): JournalEntrySourceLink {
  return { kindLabel, detail: "", href: null, noAccessHint: "Necesitás acceso al documento origen para ver su detalle." };
}

function treasuryAccountExtractoHref(accountId: string): string {
  return `/tesoreria/cuentas/${accountId}`;
}

async function resolvedTreasuryMovementCompanyId(
  m: { companyId: string | null; accountId: string },
  tenantId: string,
): Promise<string | null> {
  const acc = await prisma.treasuryAccount.findFirst({
    where: { id: m.accountId, tenantId },
    select: { companyId: true },
  });
  if (!acc || (m.companyId && acc.companyId && m.companyId !== acc.companyId)) return null;
  return m.companyId ?? acc.companyId;
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
    reversesEntryId?: string | null;
  },
): Promise<JournalEntrySourceLink | null> {
  const { sourceType, sourceId, companyId, reversesEntryId } = params;
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "ACCOUNTING")) return null;
  if (isCrossCompany(companyId, ctx)) return null;
  if (reversesEntryId) {
    const original = await prisma.journalEntry.findFirst({
      where: { id: reversesEntryId, tenantId: ctx.tenantId, companyId, status: "POSTED" },
      select: { id: true, entryDate: true, reference: true },
    });
    if (!original) return { kindLabel: "Asiento original", detail: "Asiento no encontrado.", href: null, noAccessHint: null };
    return {
      kindLabel: "Asiento original",
      detail: `${original.reference ?? "Asiento contabilizado"} · ${fmtDate(original.entryDate)}`,
      href: `/contabilidad/asientos/${original.id}?empresa=${encodeURIComponent(companyId)}`,
      noAccessHint: null,
    };
  }
  if (!sourceId || sourceId.trim() === "") return null;
  if (sourceType === "MANUAL") return null;

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
      if (!(await canViewJournalSource(ctx, "AR", c.projectId))) return hiddenSource("Cobranza");
      const detail = `${fmtDate(c.collectionDate)} · ${fmtMoneyAr(c.amount, c.currency)}`;
      const href = c.projectId ? `/proyectos/${c.projectId}/cobranzas/${c.id}` : `/finanzas/cuentas-por-cobrar/${c.receivableId}`;
      return {
        kindLabel: "Cobranza",
        detail,
        href,
        noAccessHint: null,
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
      if (!(await canViewJournalSource(ctx, "AP", p.projectId))) return hiddenSource("Pago a proveedor");
      const detail = `${fmtDate(p.paymentDate)} · ${fmtMoneyAr(p.amount, p.currency)}`;
      const href = p.projectId ? `/proyectos/${p.projectId}/pagos/${p.id}` : `/finanzas/pagos-proveedor/${p.id}`;
      return {
        kindLabel: "Pago a proveedor",
        detail,
        href,
        noAccessHint: null,
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
      const kindLabel = sourceType === "TREASURY_INFLOW" ? "Tesorería — ingreso" : "Tesorería — egreso";
      if (!(await canViewJournalSource(ctx, "TREASURY", m.projectId))) return hiddenSource(kindLabel);
      const detail = `${fmtDate(m.movementDate)} · ${m.description.slice(0, 120)}${m.description.length > 120 ? "…" : ""}`;
      return {
        kindLabel,
        detail,
        href:      treasuryAccountExtractoHref(m.accountId),
        noAccessHint: null,
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
      if (!(await canViewJournalSource(ctx, "TREASURY", null))) return hiddenSource("Transferencia interna");
      const detail = `${fmtDate(tr.transferDate)} · ${fmtMoneyAr(tr.amount, tr.currency)}`;
      return {
        kindLabel: "Transferencia interna",
        detail,
        href:      "/tesoreria/transferencias",
        noAccessHint: null,
      };
    }
    case "STOCK_MOVEMENT": {
      const sm = await prisma.stockMovement.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
        include: { product: { select: { name: true, tenantId: true } } },
      });
      if (!sm || sm.companyId !== companyId || sm.product.tenantId !== ctx.tenantId) {
        return {
          kindLabel: "Movimiento de stock",
          detail:    "Movimiento no encontrado o no coincide con la empresa del asiento.",
          href:      null,
          noAccessHint: null,
        };
      }
      if (!(await canViewJournalSource(ctx, "INVENTORY", sm.projectId))) return hiddenSource("Movimiento de stock");
      const detail = `${fmtDate(sm.movementDate)} · ${sm.product.name}`;
      const href = sm.projectId ? `/proyectos/${sm.projectId}/inventario` : "/inventario/movimientos";
      return {
        kindLabel: "Movimiento de stock",
        detail,
        href,
        noAccessHint: null,
      };
    }
    case "SALES_INVOICE":
    case "SALES_CREDIT_NOTE":
    case "SALES_DEBIT_NOTE": {
      const inv = await prisma.salesInvoice.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      const kindLabel =
        sourceType === "SALES_CREDIT_NOTE"
          ? "Nota de crédito (venta)"
          : sourceType === "SALES_DEBIT_NOTE"
            ? "Nota de débito (venta)"
            : "Factura de venta";
      if (!inv || inv.companyId !== companyId) {
        return { kindLabel, detail: "Comprobante no encontrado.", href: null, noAccessHint: null };
      }
      if (!(await canViewJournalSource(ctx, "AR", inv.projectId))) return hiddenSource(kindLabel);
      const prefix =
        inv.documentKind === "CREDIT_NOTE"
          ? "NC"
          : inv.documentKind === "DEBIT_NOTE"
            ? "ND"
            : "Factura";
      const detail = `${prefix} #${inv.number} · ${fmtDate(inv.issueDate)}`;
      const href = inv.projectId ? `/proyectos/${inv.projectId}/facturas/${inv.id}` : `/finanzas/facturas/${inv.id}`;
      return {
        kindLabel,
        detail,
        href,
        noAccessHint: null,
      };
    }
    case "SUPPLIER_INVOICE":
    case "SUPPLIER_CREDIT_NOTE":
    case "SUPPLIER_DEBIT_NOTE": {
      const inv = await prisma.supplierInvoice.findFirst({
        where: { id: sourceId, tenantId: ctx.tenantId },
      });
      const kindLabel =
        sourceType === "SUPPLIER_CREDIT_NOTE"
          ? "Nota de crédito (proveedor)"
          : sourceType === "SUPPLIER_DEBIT_NOTE"
            ? "Nota de débito (proveedor)"
            : "Factura de proveedor";
      if (!inv || inv.companyId !== companyId) {
        return { kindLabel, detail: "Comprobante no encontrado.", href: null, noAccessHint: null };
      }
      if (!(await canViewJournalSource(ctx, "AP", inv.projectId))) return hiddenSource(kindLabel);
      const prefix =
        inv.documentKind === "CREDIT_NOTE"
          ? "NC"
          : inv.documentKind === "DEBIT_NOTE"
            ? "ND"
            : "Factura proveedor";
      const detail = `${prefix} #${inv.number} · ${fmtDate(inv.issueDate)}`;
      const href = inv.projectId ? `/proyectos/${inv.projectId}/facturas-proveedor/${inv.id}` : `/finanzas/facturas-proveedor/${inv.id}`;
      return {
        kindLabel,
        detail,
        href,
        noAccessHint: null,
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
      if (!(await canViewJournalSource(ctx, "TREASURY", m.projectId))) return hiddenSource("Ajuste de tesorería");
      const detail = `${fmtDate(m.movementDate)} · ${m.description.slice(0, 120)}${m.description.length > 120 ? "…" : ""}`;
      return {
        kindLabel: "Ajuste de tesorería",
        detail,
        href:      treasuryAccountExtractoHref(m.accountId),
        noAccessHint: null,
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
