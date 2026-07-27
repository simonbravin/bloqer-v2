import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";

export type CompanyProcurementSettingsView = {
  companyId: string;
  poApprovalThresholdArs: string | null;
  purchaseRequestRequiredAboveArs: string | null;
  minQuotesRequired: number;
  maxQuotesAllowed: number;
  quoteRequiredCategories: string[] | null;
  allowDirectPo: boolean;
  allowSelfApproval: boolean;
  allowEmergencyDirectPo: boolean;
  varianceSoftAlertPct: string;
  varianceNoteRequiredPct: string;
  varianceExtraApprovalPct: string;
  overReceiptTolerancePct: string;
  invoiceMatchTolerancePct: string;
  approvalSlaHours: number;
};

const DEFAULTS = {
  minQuotesRequired: 2,
  maxQuotesAllowed: 3,
  allowDirectPo: true,
  allowSelfApproval: true,
  allowEmergencyDirectPo: false,
  varianceSoftAlertPct: new Prisma.Decimal(10),
  varianceNoteRequiredPct: new Prisma.Decimal(25),
  varianceExtraApprovalPct: new Prisma.Decimal(25),
  overReceiptTolerancePct: new Prisma.Decimal(0),
  invoiceMatchTolerancePct: new Prisma.Decimal(0),
  approvalSlaHours: 72,
};

function serialize(row: {
  companyId: string;
  poApprovalThresholdArs: Prisma.Decimal | null;
  purchaseRequestRequiredAboveArs: Prisma.Decimal | null;
  minQuotesRequired: number;
  maxQuotesAllowed: number;
  quoteRequiredCategories: unknown;
  allowDirectPo: boolean;
  allowSelfApproval: boolean;
  allowEmergencyDirectPo: boolean;
  varianceSoftAlertPct: Prisma.Decimal;
  varianceNoteRequiredPct: Prisma.Decimal;
  varianceExtraApprovalPct: Prisma.Decimal;
  overReceiptTolerancePct: Prisma.Decimal;
  invoiceMatchTolerancePct: Prisma.Decimal;
  approvalSlaHours: number;
}): CompanyProcurementSettingsView {
  const cats = row.quoteRequiredCategories;
  return {
    companyId: row.companyId,
    poApprovalThresholdArs: row.poApprovalThresholdArs?.toString() ?? null,
    purchaseRequestRequiredAboveArs: row.purchaseRequestRequiredAboveArs?.toString() ?? null,
    minQuotesRequired: row.minQuotesRequired,
    maxQuotesAllowed: row.maxQuotesAllowed,
    quoteRequiredCategories: Array.isArray(cats) ? (cats as string[]) : null,
    allowDirectPo: row.allowDirectPo,
    allowSelfApproval: row.allowSelfApproval,
    allowEmergencyDirectPo: row.allowEmergencyDirectPo,
    varianceSoftAlertPct: row.varianceSoftAlertPct.toString(),
    varianceNoteRequiredPct: row.varianceNoteRequiredPct.toString(),
    varianceExtraApprovalPct: row.varianceExtraApprovalPct.toString(),
    overReceiptTolerancePct: row.overReceiptTolerancePct.toString(),
    invoiceMatchTolerancePct: row.invoiceMatchTolerancePct.toString(),
    approvalSlaHours: row.approvalSlaHours ?? 72,
  };
}

export async function getCompanyProcurementSettings(
  companyId: string,
  ctx: ServiceContext,
): Promise<CompanyProcurementSettingsView> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");

  const row = await prisma.companyProcurementSettings.findUnique({ where: { companyId } });
  if (!row) {
    return {
      companyId,
      poApprovalThresholdArs: null,
      purchaseRequestRequiredAboveArs: null,
      ...DEFAULTS,
      quoteRequiredCategories: null,
      allowDirectPo: DEFAULTS.allowDirectPo,
      allowSelfApproval: DEFAULTS.allowSelfApproval,
      allowEmergencyDirectPo: DEFAULTS.allowEmergencyDirectPo,
      varianceSoftAlertPct: DEFAULTS.varianceSoftAlertPct.toString(),
      varianceNoteRequiredPct: DEFAULTS.varianceNoteRequiredPct.toString(),
      varianceExtraApprovalPct: DEFAULTS.varianceExtraApprovalPct.toString(),
      overReceiptTolerancePct: DEFAULTS.overReceiptTolerancePct.toString(),
      invoiceMatchTolerancePct: DEFAULTS.invoiceMatchTolerancePct.toString(),
      approvalSlaHours: DEFAULTS.approvalSlaHours,
    };
  }
  return serialize(row);
}

export async function getCompanyProcurementSettingsForProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<CompanyProcurementSettingsView> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { companyId: true },
  });
  if (!project?.companyId) {
    throw new ServiceError("CONFLICT", "El proyecto no tiene empresa asignada");
  }
  return getCompanyProcurementSettings(project.companyId, ctx);
}

export async function upsertCompanyProcurementSettings(
  companyId: string,
  input: Partial<{
    poApprovalThresholdArs: string | null;
    purchaseRequestRequiredAboveArs: string | null;
    minQuotesRequired: number;
    maxQuotesAllowed: number;
    quoteRequiredCategories: string[] | null;
    allowDirectPo: boolean;
    allowSelfApproval: boolean;
    allowEmergencyDirectPo: boolean;
    varianceSoftAlertPct: string;
    varianceNoteRequiredPct: string;
    varianceExtraApprovalPct: string;
    overReceiptTolerancePct: string;
    invoiceMatchTolerancePct: string;
    approvalSlaHours: number;
  }>,
  ctx: ServiceContext,
): Promise<CompanyProcurementSettingsView> {
  if (!can(ctx.roles, "EDIT", "TENANT_SETTINGS") && !can(ctx.roles, "APPROVE", "MASTER_DATA")) {
    if (!ctx.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para configurar compras");
    }
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: ctx.tenantId },
  });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");

  const createData: Prisma.CompanyProcurementSettingsUpsertArgs["create"] = {
    companyId,
    poApprovalThresholdArs:
      input.poApprovalThresholdArs != null && input.poApprovalThresholdArs !== ""
        ? new Prisma.Decimal(input.poApprovalThresholdArs)
        : null,
    purchaseRequestRequiredAboveArs:
      input.purchaseRequestRequiredAboveArs != null && input.purchaseRequestRequiredAboveArs !== ""
        ? new Prisma.Decimal(input.purchaseRequestRequiredAboveArs)
        : null,
    minQuotesRequired: input.minQuotesRequired ?? DEFAULTS.minQuotesRequired,
    maxQuotesAllowed: input.maxQuotesAllowed ?? DEFAULTS.maxQuotesAllowed,
    quoteRequiredCategories:
      input.quoteRequiredCategories === undefined
        ? undefined
        : input.quoteRequiredCategories === null
          ? Prisma.JsonNull
          : input.quoteRequiredCategories,
    allowDirectPo: input.allowDirectPo ?? DEFAULTS.allowDirectPo,
    allowSelfApproval: input.allowSelfApproval ?? DEFAULTS.allowSelfApproval,
    allowEmergencyDirectPo: input.allowEmergencyDirectPo ?? DEFAULTS.allowEmergencyDirectPo,
    varianceSoftAlertPct: input.varianceSoftAlertPct
      ? new Prisma.Decimal(input.varianceSoftAlertPct)
      : DEFAULTS.varianceSoftAlertPct,
    varianceNoteRequiredPct: input.varianceNoteRequiredPct
      ? new Prisma.Decimal(input.varianceNoteRequiredPct)
      : DEFAULTS.varianceNoteRequiredPct,
    varianceExtraApprovalPct: input.varianceExtraApprovalPct
      ? new Prisma.Decimal(input.varianceExtraApprovalPct)
      : DEFAULTS.varianceExtraApprovalPct,
    overReceiptTolerancePct: input.overReceiptTolerancePct
      ? new Prisma.Decimal(input.overReceiptTolerancePct)
      : DEFAULTS.overReceiptTolerancePct,
    invoiceMatchTolerancePct: input.invoiceMatchTolerancePct
      ? new Prisma.Decimal(input.invoiceMatchTolerancePct)
      : DEFAULTS.invoiceMatchTolerancePct,
    approvalSlaHours: input.approvalSlaHours ?? DEFAULTS.approvalSlaHours,
  };

  // Update only fields present in the payload so omitted keys (e.g. approvalSlaHours)
  // keep their stored values instead of resetting to defaults.
  const updateData: Prisma.CompanyProcurementSettingsUncheckedUpdateInput = {
    poApprovalThresholdArs: createData.poApprovalThresholdArs,
    purchaseRequestRequiredAboveArs: createData.purchaseRequestRequiredAboveArs,
    minQuotesRequired: createData.minQuotesRequired,
    maxQuotesAllowed: createData.maxQuotesAllowed,
    allowDirectPo: createData.allowDirectPo,
    allowSelfApproval: createData.allowSelfApproval,
    allowEmergencyDirectPo: createData.allowEmergencyDirectPo,
    varianceSoftAlertPct: createData.varianceSoftAlertPct,
    varianceNoteRequiredPct: createData.varianceNoteRequiredPct,
    varianceExtraApprovalPct: createData.varianceExtraApprovalPct,
    overReceiptTolerancePct: createData.overReceiptTolerancePct,
    invoiceMatchTolerancePct: createData.invoiceMatchTolerancePct,
  };
  if (input.quoteRequiredCategories !== undefined) {
    updateData.quoteRequiredCategories = createData.quoteRequiredCategories;
  }
  if (input.approvalSlaHours !== undefined) {
    updateData.approvalSlaHours = input.approvalSlaHours;
  }

  const row = await prisma.companyProcurementSettings.upsert({
    where: { companyId },
    create: createData,
    update: updateData,
  });
  return serialize(row);
}
