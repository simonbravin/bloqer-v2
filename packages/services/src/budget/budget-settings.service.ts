import { prisma } from "@bloqer/database";
import type { BudgetSettings } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { UpdateBudgetSettingsInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";
import { assertBudgetEditable, approvedEditOverrideAuditMeta, lockBudgetForEconomicEdit } from "./budget.service";
import { _recalcAllItems } from "./budget-calc.service";
import { isCrossCompany } from "../company-scope";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";

export async function updateBudgetSettings(
  budgetId: string,
  input: UpdateBudgetSettingsInput,
  ctx: ServiceContext,
): Promise<BudgetSettings> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await assertBudgetEditable(budget);
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  return prisma.$transaction(async (tx) => {
    const current = await lockBudgetForEconomicEdit(tx, budgetId, ctx);
    const before = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId } });
    const updated = await tx.budgetSettings.update({
      where: { budgetId },
      data: input,
    });
    await _recalcAllItems(tx, budgetId);
    await tx.budget.update({ where: { id: budgetId }, data: { updatedBy: ctx.actorUserId } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      projectId: current.projectId,
      companyId: current.companyId ?? undefined,
      action: "budget_settings.updated",
      entityType: "BudgetSettings",
      entityId: updated.id,
      before: {
        overheadPct: before.overheadPct.toString(),
        financialCostPct: before.financialCostPct.toString(),
        financialDaysAvg: before.financialDaysAvg,
        profitPct: before.profitPct.toString(),
        taxPct: before.taxPct.toString(),
      },
      after: { ...input, ...approvedEditOverrideAuditMeta(current.status) },
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
}
