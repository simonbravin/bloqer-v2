import { Prisma, prisma, type AccountType, type AccountingMappingEventType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { ApplyArgentineCoaTemplateInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";

/** Bumped when the seed list grows; apply remains idempotent by account `code` per company. */
export const ARGENTINE_COA_TEMPLATE_KEY = "ar_construction_v2";

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

/** Base CoA for Argentine construction SMEs — gerencial, not AFIP/RT 54. */
export const ARGENTINE_COA_TEMPLATE_ACCOUNTS: TemplateAccount[] = [
  { code: "1.1.01", name: "Caja", type: "ASSET" },
  { code: "1.1.02", name: "Bancos ARS", type: "ASSET" },
  { code: "1.1.03", name: "Bancos USD", type: "ASSET" },
  { code: "1.1.05", name: "Valores / cheques a depositar", type: "ASSET" },
  { code: "1.1.10", name: "Clientes / Deudores por ventas", type: "ASSET" },
  { code: "1.1.20", name: "IVA Crédito Fiscal", type: "ASSET" },
  { code: "1.1.30", name: "Anticipos a proveedores", type: "ASSET" },
  { code: "1.1.40", name: "Retenciones sufridas a cobrar", type: "ASSET" },
  { code: "1.1.50", name: "Depósitos en garantía", type: "ASSET" },
  { code: "1.2.01", name: "Materiales en stock", type: "ASSET" },
  { code: "1.2.10", name: "Bienes de uso", type: "ASSET" },
  { code: "2.1.01", name: "Proveedores", type: "LIABILITY" },
  { code: "2.1.05", name: "Cheques diferidos a pagar", type: "LIABILITY" },
  { code: "2.1.10", name: "IVA Débito Fiscal", type: "LIABILITY" },
  { code: "2.1.15", name: "Tarjetas de crédito a pagar", type: "LIABILITY" },
  { code: "2.1.20", name: "Retenciones a depositar", type: "LIABILITY" },
  { code: "2.1.30", name: "Anticipos de clientes", type: "LIABILITY" },
  { code: "2.1.40", name: "Sueldos y cargas a pagar", type: "LIABILITY" },
  { code: "2.2.01", name: "Préstamos de socios", type: "LIABILITY" },
  { code: "2.2.10", name: "Préstamos bancarios", type: "LIABILITY" },
  { code: "3.1.01", name: "Capital", type: "EQUITY" },
  { code: "3.1.10", name: "Aportes irrevocables", type: "EQUITY" },
  { code: "3.2.01", name: "Resultados del ejercicio", type: "EQUITY" },
  { code: "3.2.10", name: "Resultados de ejercicios anteriores", type: "EQUITY" },
  { code: "4.1.01", name: "Ingresos por obras / ventas", type: "INCOME" },
  { code: "4.1.10", name: "Otros ingresos", type: "INCOME" },
  { code: "4.1.20", name: "Diferencia de cambio (ganancia)", type: "INCOME" },
  { code: "5.1.01", name: "Costo de materiales / obra", type: "EXPENSE" },
  { code: "5.1.10", name: "Subcontratos", type: "EXPENSE" },
  { code: "5.1.15", name: "Fletes y logística", type: "EXPENSE" },
  { code: "5.1.20", name: "Gastos de personal", type: "EXPENSE" },
  { code: "5.1.25", name: "Combustible y movilidad", type: "EXPENSE" },
  { code: "5.1.30", name: "Gastos generales y administración", type: "EXPENSE" },
  { code: "5.1.35", name: "Servicios (luz, gas, internet)", type: "EXPENSE" },
  { code: "5.1.40", name: "Alquileres y equipos", type: "EXPENSE" },
  { code: "5.1.45", name: "Honorarios profesionales", type: "EXPENSE" },
  { code: "5.1.50", name: "Gastos financieros", type: "EXPENSE" },
  { code: "5.1.55", name: "Diferencia de cambio (pérdida)", type: "EXPENSE" },
  { code: "5.1.60", name: "Impuestos y tasas", type: "EXPENSE" },
  { code: "5.1.70", name: "Amortizaciones", type: "EXPENSE" },
];

export const ARGENTINE_COA_TEMPLATE_RULES: TemplateRule[] = [
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

function assertTemplateIntegrity(): void {
  const codes = ARGENTINE_COA_TEMPLATE_ACCOUNTS.map((a) => a.code);
  if (new Set(codes).size !== codes.length) {
    throw new ServiceError("CONFLICT", "Plantilla CoA inválida: códigos de cuenta duplicados");
  }
  const codeSet = new Set(codes);
  const events = ARGENTINE_COA_TEMPLATE_RULES.map((r) => r.eventType);
  if (new Set(events).size !== events.length) {
    throw new ServiceError("CONFLICT", "Plantilla CoA inválida: reglas con eventType duplicado");
  }
  for (const rule of ARGENTINE_COA_TEMPLATE_RULES) {
    if (!codeSet.has(rule.debitCode) || !codeSet.has(rule.creditCode)) {
      throw new ServiceError(
        "CONFLICT",
        `Plantilla CoA inválida: regla ${rule.eventType} referencia cuentas inexistentes`,
      );
    }
  }
}

export type ApplyArgentineCoaTemplateResult = {
  companyId: string;
  accountsCreated: number;
  accountsSkipped: number;
  accountsReactivated: number;
  rulesCreated: number;
  rulesSkipped: number;
  templateKey: string;
};

export async function applyArgentineChartOfAccountsTemplate(
  input: ApplyArgentineCoaTemplateInput,
  ctx: ServiceContext,
): Promise<ApplyArgentineCoaTemplateResult> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para aplicar la plantilla de cuentas");
  }
  assertTemplateIntegrity();
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);

  const result = await prisma.$transaction(
    async (tx) => {
      let accountsCreated = 0;
      let accountsSkipped = 0;
      let accountsReactivated = 0;
      const codeToId = new Map<string, string>();

      const existingAccounts = await tx.accountingAccount.findMany({
        where: { tenantId: ctx.tenantId, companyId },
        select: { id: true, code: true, isActive: true },
      });
      for (const a of existingAccounts) codeToId.set(a.code, a.id);

      for (const acc of ARGENTINE_COA_TEMPLATE_ACCOUNTS) {
        const existingId = codeToId.get(acc.code);
        if (existingId) {
          const row = existingAccounts.find((a) => a.id === existingId);
          if (row && !row.isActive) {
            await tx.accountingAccount.update({
              where: { id: existingId },
              data: { isActive: true },
            });
            row.isActive = true;
            accountsReactivated += 1;
          } else {
            accountsSkipped += 1;
          }
          continue;
        }
        try {
          const created = await tx.accountingAccount.create({
            data: {
              tenantId: ctx.tenantId,
              companyId,
              code: acc.code,
              name: acc.name,
              type: acc.type,
              isActive: true,
              description: `Plantilla AR (${ARGENTINE_COA_TEMPLATE_KEY})`,
            },
          });
          codeToId.set(acc.code, created.id);
          existingAccounts.push({ id: created.id, code: acc.code, isActive: true });
          accountsCreated += 1;
        } catch (e) {
          // Unique (tenantId, companyId, code) — concurrent/re-apply race: treat as skip.
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            const raced = await tx.accountingAccount.findFirst({
              where: { tenantId: ctx.tenantId, companyId, code: acc.code },
              select: { id: true, isActive: true },
            });
            if (raced) {
              codeToId.set(acc.code, raced.id);
              if (!raced.isActive) {
                await tx.accountingAccount.update({
                  where: { id: raced.id },
                  data: { isActive: true },
                });
                accountsReactivated += 1;
              } else {
                accountsSkipped += 1;
              }
              continue;
            }
          }
          throw e;
        }
      }

      let rulesCreated = 0;
      let rulesSkipped = 0;

      for (const rule of ARGENTINE_COA_TEMPLATE_RULES) {
        const debitAccountId = codeToId.get(rule.debitCode);
        const creditAccountId = codeToId.get(rule.creditCode);
        if (!debitAccountId || !creditAccountId) {
          throw new ServiceError(
            "CONFLICT",
            `Plantilla incompleta: faltan cuentas ${rule.debitCode} / ${rule.creditCode}`,
          );
        }

        // Idempotent: do not add a second active rule for the same event.
        const existing = await tx.accountingMappingRule.findFirst({
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

        await tx.accountingMappingRule.create({
          data: {
            tenantId: ctx.tenantId,
            companyId,
            eventType: rule.eventType,
            name: rule.name,
            description: `Regla default plantilla AR (${ARGENTINE_COA_TEMPLATE_KEY})`,
            debitAccountId,
            creditAccountId,
            priority: rule.priority,
            isActive: true,
            metadata: { templateKey: ARGENTINE_COA_TEMPLATE_KEY },
          },
        });
        rulesCreated += 1;
      }

      return {
        accountsCreated,
        accountsSkipped,
        accountsReactivated,
        rulesCreated,
        rulesSkipped,
      };
    },
    { timeout: 60_000 },
  );

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "accounting_coa_template.applied",
    entityType: "Company",
    entityId: companyId,
    after: { templateKey: ARGENTINE_COA_TEMPLATE_KEY, ...result },
    ipAddress: ctx.ipAddress,
  });

  return {
    companyId,
    ...result,
    templateKey: ARGENTINE_COA_TEMPLATE_KEY,
  };
}
