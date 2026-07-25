import { prisma, type AccountType, type AccountingMappingEventType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { ApplyArgentineCoaTemplateInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";

const TEMPLATE_KEY = "ar_construction_v1";

type TemplateAccount = {
  code: string;
  name: string;
  type: AccountType;
};

type TemplateRule = {
  eventType: AccountingMappingEventType;
  name: string;
  debitCode: string;
  creditCode: string;
  priority: number;
};

const ACCOUNTS: TemplateAccount[] = [
  { code: "1.1.01", name: "Caja", type: "ASSET" },
  { code: "1.1.02", name: "Bancos ARS", type: "ASSET" },
  { code: "1.1.03", name: "Bancos USD", type: "ASSET" },
  { code: "1.1.10", name: "Clientes / Deudores por ventas", type: "ASSET" },
  { code: "1.1.20", name: "IVA Crédito Fiscal", type: "ASSET" },
  { code: "1.1.30", name: "Anticipos a proveedores", type: "ASSET" },
  { code: "1.1.40", name: "Retenciones sufridas a cobrar", type: "ASSET" },
  { code: "1.2.01", name: "Materiales en stock", type: "ASSET" },
  { code: "1.2.10", name: "Bienes de uso", type: "ASSET" },
  { code: "2.1.01", name: "Proveedores", type: "LIABILITY" },
  { code: "2.1.10", name: "IVA Débito Fiscal", type: "LIABILITY" },
  { code: "2.1.20", name: "Retenciones a depositar", type: "LIABILITY" },
  { code: "2.1.30", name: "Anticipos de clientes", type: "LIABILITY" },
  { code: "2.2.01", name: "Préstamos de socios", type: "LIABILITY" },
  { code: "2.2.10", name: "Préstamos bancarios", type: "LIABILITY" },
  { code: "3.1.01", name: "Capital", type: "EQUITY" },
  { code: "3.1.10", name: "Aportes irrevocables", type: "EQUITY" },
  { code: "3.2.01", name: "Resultados del ejercicio", type: "EQUITY" },
  { code: "4.1.01", name: "Ingresos por obras / ventas", type: "INCOME" },
  { code: "4.1.10", name: "Otros ingresos", type: "INCOME" },
  { code: "5.1.01", name: "Costo de materiales / obra", type: "EXPENSE" },
  { code: "5.1.10", name: "Subcontratos", type: "EXPENSE" },
  { code: "5.1.20", name: "Gastos de personal", type: "EXPENSE" },
  { code: "5.1.30", name: "Gastos generales y administración", type: "EXPENSE" },
  { code: "5.1.40", name: "Alquileres y equipos", type: "EXPENSE" },
  { code: "5.1.50", name: "Gastos financieros", type: "EXPENSE" },
  { code: "5.1.60", name: "Impuestos y tasas", type: "EXPENSE" },
];

const RULES: TemplateRule[] = [
  {
    eventType: "COLLECTION_CONFIRMED",
    name: "Cobranza → Bancos / Clientes",
    debitCode: "1.1.02",
    creditCode: "1.1.10",
    priority: 100,
  },
  {
    eventType: "PAYMENT_CONFIRMED",
    name: "Pago → Proveedores / Bancos",
    debitCode: "2.1.01",
    creditCode: "1.1.02",
    priority: 100,
  },
  {
    eventType: "TREASURY_INFLOW",
    name: "Ingreso tesorería → Bancos / Otros ingresos",
    debitCode: "1.1.02",
    creditCode: "4.1.10",
    priority: 100,
  },
  {
    eventType: "TREASURY_OUTFLOW",
    name: "Egreso tesorería → Gastos / Bancos",
    debitCode: "5.1.30",
    creditCode: "1.1.02",
    priority: 100,
  },
  {
    eventType: "TREASURY_TRANSFER",
    name: "Transferencia → Bancos / Caja",
    debitCode: "1.1.02",
    creditCode: "1.1.01",
    priority: 100,
  },
  {
    eventType: "STOCK_CONSUMPTION",
    name: "Consumo stock → Costo / Inventario",
    debitCode: "5.1.01",
    creditCode: "1.2.01",
    priority: 100,
  },
  {
    eventType: "SALES_INVOICE_ISSUED",
    name: "Factura venta → Clientes / Ingresos",
    debitCode: "1.1.10",
    creditCode: "4.1.01",
    priority: 100,
  },
  {
    eventType: "SUPPLIER_INVOICE_ISSUED",
    name: "Factura compra → Costo / Proveedores",
    debitCode: "5.1.01",
    creditCode: "2.1.01",
    priority: 100,
  },
  {
    eventType: "MANUAL_CAPITAL_CONTRIBUTION",
    name: "Aporte capital → Bancos / Capital",
    debitCode: "1.1.02",
    creditCode: "3.1.01",
    priority: 100,
  },
  {
    eventType: "MANUAL_OWNER_LOAN",
    name: "Préstamo socio → Bancos / Pasivo",
    debitCode: "1.1.02",
    creditCode: "2.2.01",
    priority: 100,
  },
];

export type ApplyArgentineCoaTemplateResult = {
  companyId: string;
  accountsCreated: number;
  accountsSkipped: number;
  rulesCreated: number;
  rulesSkipped: number;
};

export async function applyArgentineChartOfAccountsTemplate(
  input: ApplyArgentineCoaTemplateInput,
  ctx: ServiceContext,
): Promise<ApplyArgentineCoaTemplateResult> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para aplicar la plantilla de cuentas");
  }
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);

  let accountsCreated = 0;
  let accountsSkipped = 0;
  const codeToId = new Map<string, string>();

  const existingAccounts = await prisma.accountingAccount.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    select: { id: true, code: true },
  });
  for (const a of existingAccounts) codeToId.set(a.code, a.id);

  for (const acc of ACCOUNTS) {
    const existingId = codeToId.get(acc.code);
    if (existingId) {
      accountsSkipped += 1;
      continue;
    }
    const created = await prisma.accountingAccount.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        isActive: true,
        description: `Plantilla AR (${TEMPLATE_KEY})`,
      },
    });
    codeToId.set(acc.code, created.id);
    accountsCreated += 1;
  }

  let rulesCreated = 0;
  let rulesSkipped = 0;

  for (const rule of RULES) {
    const debitAccountId = codeToId.get(rule.debitCode);
    const creditAccountId = codeToId.get(rule.creditCode);
    if (!debitAccountId || !creditAccountId) {
      throw new ServiceError(
        "CONFLICT",
        `Plantilla incompleta: faltan cuentas ${rule.debitCode} / ${rule.creditCode}`,
      );
    }

    // Idempotent: do not add a second active rule for the same event (manual or prior template).
    const existing = await prisma.accountingMappingRule.findFirst({
      where: {
        tenantId: ctx.tenantId,
        companyId,
        eventType: rule.eventType,
        isActive: true,
      },
      select: { id: true },
    });
    if (existing) {
      rulesSkipped += 1;
      continue;
    }

    await prisma.accountingMappingRule.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        eventType: rule.eventType,
        name: rule.name,
        description: `Regla default plantilla AR (${TEMPLATE_KEY})`,
        debitAccountId,
        creditAccountId,
        priority: rule.priority,
        isActive: true,
        metadata: { templateKey: TEMPLATE_KEY },
      },
    });
    rulesCreated += 1;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "accounting_coa_template.applied",
    entityType: "Company",
    entityId: companyId,
    after: { templateKey: TEMPLATE_KEY, accountsCreated, accountsSkipped, rulesCreated, rulesSkipped },
    ipAddress: ctx.ipAddress,
  });

  return { companyId, accountsCreated, accountsSkipped, rulesCreated, rulesSkipped };
}
