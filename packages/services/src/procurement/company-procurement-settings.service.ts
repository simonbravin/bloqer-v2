import { Prisma, prisma, type ApPaymentNotificationChannel } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { serializeMoneyDecimal, serializeRatePctDecimal } from "../finance/money-decimal";

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
  /** [D-097] Grace days before flagging a CONFIRMED/PARTIALLY_RECEIVED PO as delivery-overdue. */
  deliveryOverdueGraceDays: number;
  /** [D-097] Grace days before flagging a PR with passed neededByDate as overdue. */
  neededByOverdueGraceDays: number;
  /** [D-097] Days after first confirmed receipt before flagging a PO as received-without-invoice. */
  receiptToInvoiceSlaDays: number;
  /** [D-097] Toggle PURCHASE_ORDER_DELIVERY_OVERDUE alert. */
  deliveryAlertsEnabled: boolean;
  /** [D-097] Toggle PURCHASE_REQUEST_NEEDED_BY_OVERDUE alert. */
  neededByAlertsEnabled: boolean;
  /** [D-097] Toggle PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE alert. */
  receiptToInvoiceAlertsEnabled: boolean;
  /** [D-070] Channel for PAYABLE_READY_TO_PAY / PAYMENT_CONFIRMED. */
  apPaymentNotificationChannel: ApPaymentNotificationChannel;
};

const DEFAULTS = {
  minQuotesRequired: 2,
  maxQuotesAllowed: 3,
  allowDirectPo: true,
  allowSelfApproval: true,
  allowEmergencyDirectPo: false,
  varianceSoftAlertPct: new Prisma.Decimal(10),
  // Kept equal to soft until Q-051 ([BR-PUR-009] uses soft → NOTE_REQUIRED).
  varianceNoteRequiredPct: new Prisma.Decimal(10),
  varianceExtraApprovalPct: new Prisma.Decimal(25),
  overReceiptTolerancePct: new Prisma.Decimal(0),
  invoiceMatchTolerancePct: new Prisma.Decimal(0),
  approvalSlaHours: 72,
  deliveryOverdueGraceDays: 0,
  neededByOverdueGraceDays: 0,
  receiptToInvoiceSlaDays: 5,
  deliveryAlertsEnabled: true,
  neededByAlertsEnabled: true,
  receiptToInvoiceAlertsEnabled: true,
  apPaymentNotificationChannel: "IN_APP_AND_EMAIL" as ApPaymentNotificationChannel,
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
  deliveryOverdueGraceDays: number;
  neededByOverdueGraceDays: number;
  receiptToInvoiceSlaDays: number;
  deliveryAlertsEnabled: boolean;
  neededByAlertsEnabled: boolean;
  receiptToInvoiceAlertsEnabled: boolean;
  apPaymentNotificationChannel: ApPaymentNotificationChannel;
}): CompanyProcurementSettingsView {
  const cats = row.quoteRequiredCategories;
  return {
    companyId: row.companyId,
    poApprovalThresholdArs: row.poApprovalThresholdArs != null ? serializeMoneyDecimal(row.poApprovalThresholdArs) : null,
    purchaseRequestRequiredAboveArs: row.purchaseRequestRequiredAboveArs != null
      ? serializeMoneyDecimal(row.purchaseRequestRequiredAboveArs)
      : null,
    minQuotesRequired: row.minQuotesRequired,
    maxQuotesAllowed: row.maxQuotesAllowed,
    quoteRequiredCategories: Array.isArray(cats) ? (cats as string[]) : null,
    allowDirectPo: row.allowDirectPo,
    allowSelfApproval: row.allowSelfApproval,
    allowEmergencyDirectPo: row.allowEmergencyDirectPo,
    varianceSoftAlertPct: serializeRatePctDecimal(row.varianceSoftAlertPct),
    varianceNoteRequiredPct: serializeRatePctDecimal(row.varianceNoteRequiredPct),
    varianceExtraApprovalPct: serializeRatePctDecimal(row.varianceExtraApprovalPct),
    overReceiptTolerancePct: serializeRatePctDecimal(row.overReceiptTolerancePct),
    invoiceMatchTolerancePct: serializeRatePctDecimal(row.invoiceMatchTolerancePct),
    approvalSlaHours: row.approvalSlaHours ?? 72,
    deliveryOverdueGraceDays: row.deliveryOverdueGraceDays ?? DEFAULTS.deliveryOverdueGraceDays,
    neededByOverdueGraceDays: row.neededByOverdueGraceDays ?? DEFAULTS.neededByOverdueGraceDays,
    receiptToInvoiceSlaDays: row.receiptToInvoiceSlaDays ?? DEFAULTS.receiptToInvoiceSlaDays,
    deliveryAlertsEnabled: row.deliveryAlertsEnabled ?? DEFAULTS.deliveryAlertsEnabled,
    neededByAlertsEnabled: row.neededByAlertsEnabled ?? DEFAULTS.neededByAlertsEnabled,
    receiptToInvoiceAlertsEnabled:
      row.receiptToInvoiceAlertsEnabled ?? DEFAULTS.receiptToInvoiceAlertsEnabled,
    apPaymentNotificationChannel: row.apPaymentNotificationChannel ?? DEFAULTS.apPaymentNotificationChannel,
  };
}

function parseNullableMoney(value: string | null | undefined): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  return new Prisma.Decimal(value);
}

function parsePctOrDefault(
  value: string | undefined,
  fallback: Prisma.Decimal,
): Prisma.Decimal {
  if (value === undefined || value === "") return fallback;
  return new Prisma.Decimal(value);
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
      varianceSoftAlertPct: serializeRatePctDecimal(DEFAULTS.varianceSoftAlertPct),
      varianceNoteRequiredPct: serializeRatePctDecimal(DEFAULTS.varianceNoteRequiredPct),
      varianceExtraApprovalPct: serializeRatePctDecimal(DEFAULTS.varianceExtraApprovalPct),
      overReceiptTolerancePct: serializeRatePctDecimal(DEFAULTS.overReceiptTolerancePct),
      invoiceMatchTolerancePct: serializeRatePctDecimal(DEFAULTS.invoiceMatchTolerancePct),
      approvalSlaHours: DEFAULTS.approvalSlaHours,
      deliveryOverdueGraceDays: DEFAULTS.deliveryOverdueGraceDays,
      neededByOverdueGraceDays: DEFAULTS.neededByOverdueGraceDays,
      receiptToInvoiceSlaDays: DEFAULTS.receiptToInvoiceSlaDays,
      deliveryAlertsEnabled: DEFAULTS.deliveryAlertsEnabled,
      neededByAlertsEnabled: DEFAULTS.neededByAlertsEnabled,
      receiptToInvoiceAlertsEnabled: DEFAULTS.receiptToInvoiceAlertsEnabled,
      apPaymentNotificationChannel: DEFAULTS.apPaymentNotificationChannel,
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
    deliveryOverdueGraceDays: number;
    neededByOverdueGraceDays: number;
    receiptToInvoiceSlaDays: number;
    deliveryAlertsEnabled: boolean;
    neededByAlertsEnabled: boolean;
    receiptToInvoiceAlertsEnabled: boolean;
    apPaymentNotificationChannel: ApPaymentNotificationChannel;
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
    poApprovalThresholdArs: parseNullableMoney(input.poApprovalThresholdArs ?? null),
    purchaseRequestRequiredAboveArs: parseNullableMoney(
      input.purchaseRequestRequiredAboveArs ?? null,
    ),
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
    varianceSoftAlertPct: parsePctOrDefault(
      input.varianceSoftAlertPct,
      DEFAULTS.varianceSoftAlertPct,
    ),
    varianceNoteRequiredPct: parsePctOrDefault(
      input.varianceNoteRequiredPct,
      DEFAULTS.varianceNoteRequiredPct,
    ),
    varianceExtraApprovalPct: parsePctOrDefault(
      input.varianceExtraApprovalPct,
      DEFAULTS.varianceExtraApprovalPct,
    ),
    overReceiptTolerancePct: parsePctOrDefault(
      input.overReceiptTolerancePct,
      DEFAULTS.overReceiptTolerancePct,
    ),
    invoiceMatchTolerancePct: parsePctOrDefault(
      input.invoiceMatchTolerancePct,
      DEFAULTS.invoiceMatchTolerancePct,
    ),
    approvalSlaHours: input.approvalSlaHours ?? DEFAULTS.approvalSlaHours,
    deliveryOverdueGraceDays:
      input.deliveryOverdueGraceDays ?? DEFAULTS.deliveryOverdueGraceDays,
    neededByOverdueGraceDays:
      input.neededByOverdueGraceDays ?? DEFAULTS.neededByOverdueGraceDays,
    receiptToInvoiceSlaDays:
      input.receiptToInvoiceSlaDays ?? DEFAULTS.receiptToInvoiceSlaDays,
    deliveryAlertsEnabled:
      input.deliveryAlertsEnabled ?? DEFAULTS.deliveryAlertsEnabled,
    neededByAlertsEnabled:
      input.neededByAlertsEnabled ?? DEFAULTS.neededByAlertsEnabled,
    receiptToInvoiceAlertsEnabled:
      input.receiptToInvoiceAlertsEnabled ?? DEFAULTS.receiptToInvoiceAlertsEnabled,
    apPaymentNotificationChannel:
      input.apPaymentNotificationChannel ?? DEFAULTS.apPaymentNotificationChannel,
  };

  // True partial update: only keys present in the payload are written.
  const updateData: Prisma.CompanyProcurementSettingsUncheckedUpdateInput = {};
  if (input.poApprovalThresholdArs !== undefined) {
    updateData.poApprovalThresholdArs = parseNullableMoney(input.poApprovalThresholdArs);
  }
  if (input.purchaseRequestRequiredAboveArs !== undefined) {
    updateData.purchaseRequestRequiredAboveArs = parseNullableMoney(
      input.purchaseRequestRequiredAboveArs,
    );
  }
  if (input.minQuotesRequired !== undefined) {
    updateData.minQuotesRequired = input.minQuotesRequired;
  }
  if (input.maxQuotesAllowed !== undefined) {
    updateData.maxQuotesAllowed = input.maxQuotesAllowed;
  }
  if (input.quoteRequiredCategories !== undefined) {
    updateData.quoteRequiredCategories =
      input.quoteRequiredCategories === null
        ? Prisma.JsonNull
        : input.quoteRequiredCategories;
  }
  if (input.allowDirectPo !== undefined) {
    updateData.allowDirectPo = input.allowDirectPo;
  }
  if (input.allowSelfApproval !== undefined) {
    updateData.allowSelfApproval = input.allowSelfApproval;
  }
  if (input.allowEmergencyDirectPo !== undefined) {
    updateData.allowEmergencyDirectPo = input.allowEmergencyDirectPo;
  }
  if (input.varianceSoftAlertPct !== undefined) {
    updateData.varianceSoftAlertPct = parsePctOrDefault(
      input.varianceSoftAlertPct,
      DEFAULTS.varianceSoftAlertPct,
    );
  }
  if (input.varianceNoteRequiredPct !== undefined) {
    updateData.varianceNoteRequiredPct = parsePctOrDefault(
      input.varianceNoteRequiredPct,
      DEFAULTS.varianceNoteRequiredPct,
    );
  }
  if (input.varianceExtraApprovalPct !== undefined) {
    updateData.varianceExtraApprovalPct = parsePctOrDefault(
      input.varianceExtraApprovalPct,
      DEFAULTS.varianceExtraApprovalPct,
    );
  }
  if (input.overReceiptTolerancePct !== undefined) {
    updateData.overReceiptTolerancePct = parsePctOrDefault(
      input.overReceiptTolerancePct,
      DEFAULTS.overReceiptTolerancePct,
    );
  }
  if (input.invoiceMatchTolerancePct !== undefined) {
    updateData.invoiceMatchTolerancePct = parsePctOrDefault(
      input.invoiceMatchTolerancePct,
      DEFAULTS.invoiceMatchTolerancePct,
    );
  }
  if (input.approvalSlaHours !== undefined) {
    updateData.approvalSlaHours = input.approvalSlaHours;
  }
  if (input.deliveryOverdueGraceDays !== undefined) {
    updateData.deliveryOverdueGraceDays = input.deliveryOverdueGraceDays;
  }
  if (input.neededByOverdueGraceDays !== undefined) {
    updateData.neededByOverdueGraceDays = input.neededByOverdueGraceDays;
  }
  if (input.receiptToInvoiceSlaDays !== undefined) {
    updateData.receiptToInvoiceSlaDays = input.receiptToInvoiceSlaDays;
  }
  if (input.deliveryAlertsEnabled !== undefined) {
    updateData.deliveryAlertsEnabled = input.deliveryAlertsEnabled;
  }
  if (input.neededByAlertsEnabled !== undefined) {
    updateData.neededByAlertsEnabled = input.neededByAlertsEnabled;
  }
  if (input.receiptToInvoiceAlertsEnabled !== undefined) {
    updateData.receiptToInvoiceAlertsEnabled = input.receiptToInvoiceAlertsEnabled;
  }
  if (input.apPaymentNotificationChannel !== undefined) {
    updateData.apPaymentNotificationChannel = input.apPaymentNotificationChannel;
  }

  const row = await prisma.companyProcurementSettings.upsert({
    where: { companyId },
    create: createData,
    update: updateData,
  });
  return serialize(row);
}
