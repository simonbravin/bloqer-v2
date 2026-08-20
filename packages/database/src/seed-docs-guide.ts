import { createHash } from "crypto";
import { hash } from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

/** Previous demo company PK (not a UUID). Remapped once by seedDocsGuideDataset. */
const LEGACY_DEMO_COMPANY_ID = "seed-company-id";
const DOCS_PM_EMAIL = "docs-pm@bloqer.demo";
const DOCS_VIEWER_EMAIL = "docs-viewer@bloqer.demo";

/** Stable IDs for guide captures — safe to reference from Playwright and env overrides. */
export const DOCS_GUIDE_IDS = {
  companyId: "00000000-0000-4000-8000-000000000001",
  clientContactId: "a0000001-0000-4000-8000-000000000001",
  supplierContactId: "a0000002-0000-4000-8000-000000000002",
  subcontractorContactId: "a0000003-0000-4000-8000-000000000003",
  projectId: "a0000010-0000-4000-8000-000000000010",
  scheduleId: "a0000011-0000-4000-8000-000000000011",
  confirmedPoId: "a0000020-0000-4000-8000-000000000020",
  confirmedPoLineId: "a0000021-0000-4000-8000-000000000021",
  budgetId: "a0000030-0000-4000-8000-000000000030",
  budgetSettingsId: "a0000031-0000-4000-8000-000000000031",
  wbsGroup01Id: "a0000032-0000-4000-8000-000000000032",
  wbsGroup02Id: "a0000033-0000-4000-8000-000000000033",
  wbsGroup03Id: "a0000034-0000-4000-8000-000000000034",
  wbsItem0101Id: "a0000040-0000-4000-8000-000000000040",
  wbsItem0102Id: "a0000041-0000-4000-8000-000000000041",
  wbsItem0201Id: "a0000042-0000-4000-8000-000000000042",
  wbsItem0202Id: "a0000043-0000-4000-8000-000000000043",
  wbsItem0301Id: "a0000044-0000-4000-8000-000000000044",
  wbsItem0302Id: "a0000045-0000-4000-8000-000000000045",
  wbsItem0303Id: "a0000046-0000-4000-8000-000000000046",
  wbsExpandItemNodeId: "a0000040-0000-4000-8000-000000000040",
  costItem0101Id: "a0000050-0000-4000-8000-000000000050",
  costItem0102Id: "a0000051-0000-4000-8000-000000000051",
  costItem0201Id: "a0000052-0000-4000-8000-000000000052",
  costItem0202Id: "a0000053-0000-4000-8000-000000000053",
  costItem0301Id: "a0000054-0000-4000-8000-000000000054",
  costItem0302Id: "a0000055-0000-4000-8000-000000000055",
  costItem0303Id: "a0000056-0000-4000-8000-000000000056",
  treasuryAccountId: "a0000060-0000-4000-8000-000000000060",
  treasuryAccountCloseId: "a0000068-0000-4000-8000-000000000068",
  movementOpeningId: "a0000061-0000-4000-8000-000000000061",
  movementInflowId: "a0000062-0000-4000-8000-000000000062",
  movementOutflowId: "a0000063-0000-4000-8000-000000000063",
  movementCloseInflowId: "a0000069-0000-4000-8000-000000000069",
  reconciliationInProgressId: "a0000064-0000-4000-8000-000000000064",
  reconciliationCloseReadyId: "a0000065-0000-4000-8000-000000000065",
  statementLineCreditId: "a0000066-0000-4000-8000-000000000066",
  statementLineDebitId: "a0000067-0000-4000-8000-000000000067",
  statementLineFeeId: "a0000070-0000-4000-8000-000000000070",
  statementLineCloseCreditId: "a0000071-0000-4000-8000-000000000071",
  reconciliationMatchCreditId: "a0000072-0000-4000-8000-000000000072",
  reconciliationMatchDebitId: "a0000073-0000-4000-8000-000000000073",
  reconciliationMatchCloseId: "a0000074-0000-4000-8000-000000000074",
  subcontractId: "a0000080-0000-4000-8000-000000000080",
  subcontractLineId: "a0000081-0000-4000-8000-000000000081",
  subcontractCertificationId: "a0000082-0000-4000-8000-000000000082",
  subcontractCertLineId: "a0000083-0000-4000-8000-000000000083",
  supplierInvoiceDraftId: "a0000084-0000-4000-8000-000000000084",
  supplierInvoiceLineId: "a0000085-0000-4000-8000-000000000085",
  certificationId: "a0000090-0000-4000-8000-000000000090",
  certificationLineId: "a0000091-0000-4000-8000-000000000091",
  salesInvoiceId: "a0000092-0000-4000-8000-000000000092",
  salesInvoiceLineId: "a0000093-0000-4000-8000-000000000093",
  receivableId: "a0000094-0000-4000-8000-000000000094",
  jobsiteLogId: "a00000a0-0000-4000-8000-0000000000a0",
  jobsiteLogProgressId: "a00000a1-0000-4000-8000-0000000000a1",
  tenantInvitationId: "a00000b0-0000-4000-8000-0000000000b0",
  productCementId: "a00000e0-0000-4000-8000-0000000000e0",
  warehouseCentralId: "a00000e1-0000-4000-8000-0000000000e1",
  openingStockId: "a00000e2-0000-4000-8000-0000000000e2",
  purchaseRequestId: "a00000e3-0000-4000-8000-0000000000e3",
  purchaseRequestLineId: "a00000e4-0000-4000-8000-0000000000e4",
  submittedPoId: "a00000e5-0000-4000-8000-0000000000e5",
  submittedPoLineId: "a00000e6-0000-4000-8000-0000000000e6",
  returnPoId: "a00000e7-0000-4000-8000-0000000000e7",
  returnPoLineId: "a00000e8-0000-4000-8000-0000000000e8",
  project2Id: "a00000f0-0000-4000-8000-0000000000f0",
  issuedCertificationId: "a00000f1-0000-4000-8000-0000000000f1",
  issuedCertificationLineId: "a00000f2-0000-4000-8000-0000000000f2",
  issuedSubcontractCertId: "a00000f3-0000-4000-8000-0000000000f3",
  issuedSubcontractCertLineId: "a00000f4-0000-4000-8000-0000000000f4",
} as const;

const DOCS_TENANT_NAME = "Bloqer Demo Construcciones";
const FAKE_CLIENT_TAX_ID = "20-99999999-6";
const FAKE_SUPPLIER_TAX_ID = "20-99999998-8";
const FAKE_SUBCONTRACTOR_TAX_ID = "20-99999997-0";
const DOCS_INVITATION_EMAIL = "invitado.demo@bloqer.test";

function money(value: number): string {
  return value.toFixed(4);
}

function scheduleTaskDates(base: Date, offsetDays: number, duration: number) {
  const start = new Date(base);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + duration);
  return { start, end, duration };
}

function docsInvitationRawToken(): string {
  const fromEnv = process.env.DOCS_INVITATION_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return createHash("sha256").update("bloqer-docs-guide-invite-token-v1", "utf8").digest("hex");
}

function hashInvitationToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

type SeedCtx = {
  tenantId: string;
  companyId: string;
  docsUserId: string;
  clientId: string;
  supplierId: string;
  subcontractorId: string;
};

async function seedBudgetAndWbs(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const budgetTotalSale = money(8_450_000);
  const budgetTotalCost = money(5_920_000);

  await prisma.budget.upsert({
    where: { id: DOCS_GUIDE_IDS.budgetId },
    update: {
      status: "APPROVED",
      name: "Presupuesto base demo",
      totalCost: budgetTotalCost,
      totalSalePrice: budgetTotalSale,
    },
    create: {
      id: DOCS_GUIDE_IDS.budgetId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      versionNumber: 1,
      name: "Presupuesto base demo",
      status: "APPROVED",
      currency: "ARS",
      totalCost: budgetTotalCost,
      totalSalePrice: budgetTotalSale,
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.budgetSettings.upsert({
    where: { budgetId: DOCS_GUIDE_IDS.budgetId },
    update: {},
    create: {
      id: DOCS_GUIDE_IDS.budgetSettingsId,
      budgetId: DOCS_GUIDE_IDS.budgetId,
      overheadPct: "8.0000",
      profitPct: "12.0000",
      taxPct: "21.0000",
    },
  });

  const groups = [
    { id: DOCS_GUIDE_IDS.wbsGroup01Id, code: "01", name: "Obra gruesa", sortOrder: 0 },
    { id: DOCS_GUIDE_IDS.wbsGroup02Id, code: "02", name: "Instalaciones", sortOrder: 1 },
    { id: DOCS_GUIDE_IDS.wbsGroup03Id, code: "03", name: "Terminaciones", sortOrder: 2 },
  ] as const;

  for (const group of groups) {
    await prisma.wbsNode.upsert({
      where: { id: group.id },
      update: { name: group.name, code: group.code, sortOrder: group.sortOrder },
      create: {
        id: group.id,
        budgetId: DOCS_GUIDE_IDS.budgetId,
        type: "GROUP",
        code: group.code,
        name: group.name,
        sortOrder: group.sortOrder,
      },
    });
  }

  const items = [
    {
      id: DOCS_GUIDE_IDS.wbsItem0101Id,
      costItemId: DOCS_GUIDE_IDS.costItem0101Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup01Id,
      code: "01.01",
      name: "Excavación y movimiento de suelos",
      unit: "m3",
      quantity: 120,
      unitCostDirect: 2800,
      unitSalePrice: 4200,
      apu: [
        { id: "a00000c0-0000-4000-8000-0000000000c0", category: "MATERIAL" as const, description: "Combustible maquinaria", unit: "l", coefficient: 2.5, unitCost: 450 },
        { id: "a00000c1-0000-4000-8000-0000000000c1", category: "LABOR" as const, description: "Operario excavación", unit: "jornal", coefficient: 0.08, unitCost: 18000 },
      ],
    },
    {
      id: DOCS_GUIDE_IDS.wbsItem0102Id,
      costItemId: DOCS_GUIDE_IDS.costItem0102Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup01Id,
      code: "01.02",
      name: "Hormigón de fundación",
      unit: "m3",
      quantity: 80,
      unitCostDirect: 95000,
      unitSalePrice: 125000,
      apu: [
        { id: "a00000c2-0000-4000-8000-0000000000c2", category: "MATERIAL" as const, description: "Hormigón H21", unit: "m3", coefficient: 1.05, unitCost: 85000 },
        { id: "a00000c3-0000-4000-8000-0000000000c3", category: "LABOR" as const, description: "Cuadrilla hormigonado", unit: "jornal", coefficient: 0.25, unitCost: 22000 },
        { id: "a00000c4-0000-4000-8000-0000000000c4", category: "EQUIPMENT" as const, description: "Bomba hormigonera", unit: "h", coefficient: 0.15, unitCost: 35000 },
      ],
    },
    {
      id: DOCS_GUIDE_IDS.wbsItem0201Id,
      costItemId: DOCS_GUIDE_IDS.costItem0201Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup02Id,
      code: "02.01",
      name: "Cañerías sanitarias",
      unit: "ml",
      quantity: 200,
      unitCostDirect: 8500,
      unitSalePrice: 12000,
      apu: [
        { id: "a00000c5-0000-4000-8000-0000000000c5", category: "MATERIAL" as const, description: "Caño PVC", unit: "ml", coefficient: 1.02, unitCost: 4200 },
        { id: "a00000c6-0000-4000-8000-0000000000c6", category: "LABOR" as const, description: "Plomero", unit: "jornal", coefficient: 0.04, unitCost: 19000 },
      ],
    },
    {
      id: DOCS_GUIDE_IDS.wbsItem0202Id,
      costItemId: DOCS_GUIDE_IDS.costItem0202Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup02Id,
      code: "02.02",
      name: "Tablero eléctrico principal",
      unit: "u",
      quantity: 2,
      unitCostDirect: 180000,
      unitSalePrice: 245000,
      apu: [
        { id: "a00000c7-0000-4000-8000-0000000000c7", category: "MATERIAL" as const, description: "Tablero y protecciones", unit: "u", coefficient: 1, unitCost: 120000 },
        { id: "a00000c8-0000-4000-8000-0000000000c8", category: "LABOR" as const, description: "Electricista matriculado", unit: "jornal", coefficient: 3, unitCost: 20000 },
      ],
    },
    {
      id: DOCS_GUIDE_IDS.wbsItem0301Id,
      costItemId: DOCS_GUIDE_IDS.costItem0301Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup03Id,
      code: "03.01",
      name: "Revoque fino interior",
      unit: "m2",
      quantity: 450,
      unitCostDirect: 3200,
      unitSalePrice: 4800,
      apu: [
        { id: "a00000c9-0000-4000-8000-0000000000c9", category: "MATERIAL" as const, description: "Mortero revoque", unit: "kg", coefficient: 8, unitCost: 180 },
        { id: "a00000ca-0000-4000-8000-0000000000ca", category: "LABOR" as const, description: "Revoquista", unit: "jornal", coefficient: 0.03, unitCost: 17000 },
      ],
    },
    {
      id: DOCS_GUIDE_IDS.wbsItem0302Id,
      costItemId: DOCS_GUIDE_IDS.costItem0302Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup03Id,
      code: "03.02",
      name: "Pintura látex",
      unit: "m2",
      quantity: 450,
      unitCostDirect: 1800,
      unitSalePrice: 2900,
      apu: [
        { id: "a00000cb-0000-4000-8000-0000000000cb", category: "MATERIAL" as const, description: "Látex acrílico", unit: "l", coefficient: 0.25, unitCost: 5200 },
        { id: "a00000cc-0000-4000-8000-0000000000cc", category: "LABOR" as const, description: "Pintor", unit: "jornal", coefficient: 0.02, unitCost: 16000 },
      ],
    },
    {
      id: DOCS_GUIDE_IDS.wbsItem0303Id,
      costItemId: DOCS_GUIDE_IDS.costItem0303Id,
      parentId: DOCS_GUIDE_IDS.wbsGroup03Id,
      code: "03.03",
      name: "Carpintería de madera",
      unit: "u",
      quantity: 12,
      unitCostDirect: 95000,
      unitSalePrice: 135000,
      apu: [
        { id: "a00000cd-0000-4000-8000-0000000000cd", category: "MATERIAL" as const, description: "Madera machimbre", unit: "m2", coefficient: 2.5, unitCost: 18000 },
        { id: "a00000ce-0000-4000-8000-0000000000ce", category: "LABOR" as const, description: "Carpintero", unit: "jornal", coefficient: 2, unitCost: 21000 },
      ],
    },
  ] as const;

  for (const [idx, item] of items.entries()) {
    await prisma.wbsNode.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        code: item.code,
        parentId: item.parentId,
        sortOrder: idx,
      },
      create: {
        id: item.id,
        budgetId: DOCS_GUIDE_IDS.budgetId,
        parentId: item.parentId,
        type: "ITEM",
        code: item.code,
        name: item.name,
        sortOrder: idx,
      },
    });

    const totalCostDirect = item.quantity * item.unitCostDirect;
    const totalSalePrice = item.quantity * item.unitSalePrice;

    await prisma.costItem.upsert({
      where: { id: item.costItemId },
      update: {
        unit: item.unit,
        quantity: money(item.quantity),
        unitCostDirect: money(item.unitCostDirect),
        unitSalePrice: money(item.unitSalePrice),
        totalCostDirect: money(totalCostDirect),
        totalSalePrice: money(totalSalePrice),
      },
      create: {
        id: item.costItemId,
        budgetId: DOCS_GUIDE_IDS.budgetId,
        wbsNodeId: item.id,
        unit: item.unit,
        quantity: money(item.quantity),
        unitCostDirect: money(item.unitCostDirect),
        unitSalePrice: money(item.unitSalePrice),
        totalCostDirect: money(totalCostDirect),
        totalSalePrice: money(totalSalePrice),
      },
    });

    for (const [lineIdx, line] of item.apu.entries()) {
      const totalCost = item.quantity * line.coefficient * line.unitCost;
      await prisma.costAnalysisLine.upsert({
        where: { id: line.id },
        update: {
          description: line.description,
          unit: line.unit,
          coefficient: money(line.coefficient),
          unitCost: money(line.unitCost),
          totalCost: money(totalCost),
          sortOrder: lineIdx,
        },
        create: {
          id: line.id,
          costItemId: item.costItemId,
          budgetId: DOCS_GUIDE_IDS.budgetId,
          category: line.category,
          description: line.description,
          unit: line.unit,
          coefficient: money(line.coefficient),
          unitCost: money(line.unitCost),
          totalCost: money(totalCost),
          sortOrder: lineIdx,
          supplierContactId: line.category === "MATERIAL" ? ctx.supplierId : undefined,
        },
      });
    }
  }
}

async function seedTreasury(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const periodStart = new Date("2026-03-01T12:00:00.000Z");
  const periodEnd = new Date("2026-03-31T12:00:00.000Z");
  const movementDate = new Date("2026-03-10T12:00:00.000Z");

  await prisma.treasuryAccount.upsert({
    where: { id: DOCS_GUIDE_IDS.treasuryAccountId },
    update: {
      name: "Cuenta Demo Conciliación",
      status: "ACTIVE",
      openingBalance: money(1_000_000),
    },
    create: {
      id: DOCS_GUIDE_IDS.treasuryAccountId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      name: "Cuenta Demo Conciliación",
      type: "BANK",
      currency: "ARS",
      bankName: "Banco Demo",
      accountNumber: "000-123456/7",
      openingBalance: money(1_000_000),
      status: "ACTIVE",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.treasuryAccount.upsert({
    where: { id: DOCS_GUIDE_IDS.treasuryAccountCloseId },
    update: {
      name: "Cuenta Demo Cierre",
      status: "ACTIVE",
      openingBalance: money(0),
    },
    create: {
      id: DOCS_GUIDE_IDS.treasuryAccountCloseId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      name: "Cuenta Demo Cierre",
      type: "BANK",
      currency: "ARS",
      bankName: "Banco Demo",
      accountNumber: "000-987654/3",
      openingBalance: money(0),
      status: "ACTIVE",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.accountMovement.upsert({
    where: { id: DOCS_GUIDE_IDS.movementOpeningId },
    update: {
      amount: money(1_000_000),
      status: "RECONCILED",
      description: "Saldo inicial demo",
    },
    create: {
      id: DOCS_GUIDE_IDS.movementOpeningId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: DOCS_GUIDE_IDS.treasuryAccountId,
      movementDate: periodStart,
      type: "INFLOW",
      sourceType: "OPENING_BALANCE",
      currency: "ARS",
      amount: money(1_000_000),
      description: "Saldo inicial demo",
      status: "RECONCILED",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.accountMovement.upsert({
    where: { id: DOCS_GUIDE_IDS.movementInflowId },
    update: {
      amount: money(1_500_000),
      status: "RECONCILED",
      description: "Cobranza cliente demo",
      counterpartyContactId: ctx.clientId,
    },
    create: {
      id: DOCS_GUIDE_IDS.movementInflowId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: DOCS_GUIDE_IDS.treasuryAccountId,
      projectId: DOCS_GUIDE_IDS.projectId,
      counterpartyContactId: ctx.clientId,
      movementDate,
      type: "INFLOW",
      sourceType: "COLLECTION",
      currency: "ARS",
      amount: money(1_500_000),
      description: "Cobranza cliente demo",
      status: "RECONCILED",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.accountMovement.upsert({
    where: { id: DOCS_GUIDE_IDS.movementOutflowId },
    update: {
      amount: money(350_000),
      status: "CONFIRMED",
      description: "Pago proveedor demo",
      counterpartyContactId: ctx.supplierId,
    },
    create: {
      id: DOCS_GUIDE_IDS.movementOutflowId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: DOCS_GUIDE_IDS.treasuryAccountId,
      projectId: DOCS_GUIDE_IDS.projectId,
      counterpartyContactId: ctx.supplierId,
      movementDate: new Date("2026-03-12T12:00:00.000Z"),
      type: "OUTFLOW",
      sourceType: "PAYMENT",
      currency: "ARS",
      amount: money(350_000),
      description: "Pago proveedor demo",
      status: "CONFIRMED",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.accountMovement.upsert({
    where: { id: DOCS_GUIDE_IDS.movementCloseInflowId },
    update: {
      amount: money(500_000),
      status: "RECONCILED",
      description: "Cobranza parcial demo cierre",
    },
    create: {
      id: DOCS_GUIDE_IDS.movementCloseInflowId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: DOCS_GUIDE_IDS.treasuryAccountCloseId,
      projectId: DOCS_GUIDE_IDS.projectId,
      counterpartyContactId: ctx.clientId,
      movementDate,
      type: "INFLOW",
      sourceType: "COLLECTION",
      currency: "ARS",
      amount: money(500_000),
      description: "Cobranza parcial demo cierre",
      status: "RECONCILED",
      createdBy: ctx.docsUserId,
    },
  });

  const openingMain = 1_000_000;
  const closingMain = openingMain + 1_500_000 - 350_000 - 12_500;

  await prisma.bankReconciliation.upsert({
    where: { id: DOCS_GUIDE_IDS.reconciliationInProgressId },
    update: {
      status: "IN_PROGRESS",
      openingBalance: money(openingMain),
      closingBalance: money(closingMain),
    },
    create: {
      id: DOCS_GUIDE_IDS.reconciliationInProgressId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: DOCS_GUIDE_IDS.treasuryAccountId,
      periodStart,
      periodEnd,
      currency: "ARS",
      openingBalance: money(openingMain),
      closingBalance: money(closingMain),
      status: "IN_PROGRESS",
      notes: "Sesión demo en progreso para guía operativa.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.bankStatementLine.upsert({
    where: { id: DOCS_GUIDE_IDS.statementLineCreditId },
    update: {
      description: "Transferencia acreditada cliente demo",
      amount: money(1_500_000),
      direction: "CREDIT",
    },
    create: {
      id: DOCS_GUIDE_IDS.statementLineCreditId,
      tenantId: ctx.tenantId,
      reconciliationId: DOCS_GUIDE_IDS.reconciliationInProgressId,
      lineDate: movementDate,
      description: "Transferencia acreditada cliente demo",
      amount: money(1_500_000),
      direction: "CREDIT",
      reference: "TRF-001",
      sortOrder: 0,
    },
  });

  await prisma.bankStatementLine.upsert({
    where: { id: DOCS_GUIDE_IDS.statementLineDebitId },
    update: {
      description: "Pago proveedor demo",
      amount: money(350_000),
      direction: "DEBIT",
    },
    create: {
      id: DOCS_GUIDE_IDS.statementLineDebitId,
      tenantId: ctx.tenantId,
      reconciliationId: DOCS_GUIDE_IDS.reconciliationInProgressId,
      lineDate: new Date("2026-03-12T12:00:00.000Z"),
      description: "Pago proveedor demo",
      amount: money(350_000),
      direction: "DEBIT",
      reference: "TRF-002",
      sortOrder: 1,
    },
  });

  await prisma.bankStatementLine.upsert({
    where: { id: DOCS_GUIDE_IDS.statementLineFeeId },
    update: {
      description: "Comisión bancaria",
      amount: money(12_500),
      direction: "DEBIT",
    },
    create: {
      id: DOCS_GUIDE_IDS.statementLineFeeId,
      tenantId: ctx.tenantId,
      reconciliationId: DOCS_GUIDE_IDS.reconciliationInProgressId,
      lineDate: new Date("2026-03-15T12:00:00.000Z"),
      description: "Comisión bancaria",
      amount: money(12_500),
      direction: "DEBIT",
      reference: "COM-003",
      sortOrder: 2,
    },
  });

  await prisma.bankReconciliationMatch.upsert({
    where: { id: DOCS_GUIDE_IDS.reconciliationMatchCreditId },
    update: {},
    create: {
      id: DOCS_GUIDE_IDS.reconciliationMatchCreditId,
      tenantId: ctx.tenantId,
      reconciliationId: DOCS_GUIDE_IDS.reconciliationInProgressId,
      statementLineId: DOCS_GUIDE_IDS.statementLineCreditId,
      accountMovementId: DOCS_GUIDE_IDS.movementInflowId,
      matchedBy: ctx.docsUserId,
    },
  });

  await prisma.bankReconciliation.upsert({
    where: { id: DOCS_GUIDE_IDS.reconciliationCloseReadyId },
    update: {
      status: "IN_PROGRESS",
      openingBalance: money(0),
      closingBalance: money(500_000),
    },
    create: {
      id: DOCS_GUIDE_IDS.reconciliationCloseReadyId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: DOCS_GUIDE_IDS.treasuryAccountCloseId,
      periodStart,
      periodEnd,
      currency: "ARS",
      openingBalance: money(0),
      closingBalance: money(500_000),
      status: "IN_PROGRESS",
      notes: "Sesión demo cuadrada para captura de cierre.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.bankStatementLine.upsert({
    where: { id: DOCS_GUIDE_IDS.statementLineCloseCreditId },
    update: {
      description: "Transferencia acreditada cierre demo",
      amount: money(500_000),
      direction: "CREDIT",
    },
    create: {
      id: DOCS_GUIDE_IDS.statementLineCloseCreditId,
      tenantId: ctx.tenantId,
      reconciliationId: DOCS_GUIDE_IDS.reconciliationCloseReadyId,
      lineDate: movementDate,
      description: "Transferencia acreditada cierre demo",
      amount: money(500_000),
      direction: "CREDIT",
      reference: "TRF-CLOSE",
      sortOrder: 0,
    },
  });

  await prisma.bankReconciliationMatch.upsert({
    where: { id: DOCS_GUIDE_IDS.reconciliationMatchCloseId },
    update: {},
    create: {
      id: DOCS_GUIDE_IDS.reconciliationMatchCloseId,
      tenantId: ctx.tenantId,
      reconciliationId: DOCS_GUIDE_IDS.reconciliationCloseReadyId,
      statementLineId: DOCS_GUIDE_IDS.statementLineCloseCreditId,
      accountMovementId: DOCS_GUIDE_IDS.movementCloseInflowId,
      matchedBy: ctx.docsUserId,
    },
  });
}

async function seedSubcontractChain(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const lineQty = "100.0000";
  const linePrice = "8500.0000";
  const lineTotal = "850000.0000";
  const certCurrentQty = "35.0000";
  const certLineTotal = "297500.0000";

  await prisma.subcontract.upsert({
    where: { id: DOCS_GUIDE_IDS.subcontractId },
    update: {
      status: "ACTIVE",
      title: "Mampostería y revoque",
    },
    create: {
      id: DOCS_GUIDE_IDS.subcontractId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      subcontractorContactId: ctx.subcontractorId,
      number: 1,
      title: "Mampostería y revoque",
      contractDate: new Date("2026-02-01T12:00:00.000Z"),
      startDate: new Date("2026-02-15T12:00:00.000Z"),
      expectedEndDate: new Date("2026-08-30T12:00:00.000Z"),
      currency: "ARS",
      status: "ACTIVE",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.subcontractLine.upsert({
    where: { id: DOCS_GUIDE_IDS.subcontractLineId },
    update: {
      description: "Revoque exterior",
      quantity: lineQty,
      unitPrice: linePrice,
      lineTotal,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0301Id,
    },
    create: {
      id: DOCS_GUIDE_IDS.subcontractLineId,
      subcontractId: DOCS_GUIDE_IDS.subcontractId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0301Id,
      description: "Revoque exterior",
      unit: "m2",
      quantity: lineQty,
      unitPrice: linePrice,
      lineTotal,
      certifiedQuantity: certCurrentQty,
      sortOrder: 0,
    },
  });

  await prisma.subcontractCertification.upsert({
    where: { id: DOCS_GUIDE_IDS.subcontractCertificationId },
    update: {
      status: "APPROVED",
    },
    create: {
      id: DOCS_GUIDE_IDS.subcontractCertificationId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      subcontractId: DOCS_GUIDE_IDS.subcontractId,
      subcontractorContactId: ctx.subcontractorId,
      number: 1,
      periodStart: new Date("2026-03-01T12:00:00.000Z"),
      periodEnd: new Date("2026-03-31T12:00:00.000Z"),
      certificationDate: new Date("2026-04-02T12:00:00.000Z"),
      status: "APPROVED",
      notes: "Certificación demo aprobada con factura proveedor en borrador.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.subcontractCertificationLine.upsert({
    where: { id: DOCS_GUIDE_IDS.subcontractCertLineId },
    update: {
      currentQty: certCurrentQty,
      cumulativeQty: certCurrentQty,
      remainingQty: "65.0000",
      lineTotal: certLineTotal,
    },
    create: {
      id: DOCS_GUIDE_IDS.subcontractCertLineId,
      subcontractCertificationId: DOCS_GUIDE_IDS.subcontractCertificationId,
      subcontractLineId: DOCS_GUIDE_IDS.subcontractLineId,
      previousQty: "0.0000",
      currentQty: certCurrentQty,
      cumulativeQty: certCurrentQty,
      remainingQty: "65.0000",
      unitPriceSnapshot: linePrice,
      lineTotal: certLineTotal,
      sortOrder: 0,
    },
  });

  const supplierSubtotal = certLineTotal;
  const supplierTax = money(parseFloat(certLineTotal) * 0.21);
  const supplierTotal = money(parseFloat(certLineTotal) * 1.21);

  await prisma.supplierInvoice.upsert({
    where: { id: DOCS_GUIDE_IDS.supplierInvoiceDraftId },
    update: {
      status: "DRAFT",
      subcontractCertificationId: DOCS_GUIDE_IDS.subcontractCertificationId,
      subtotal: supplierSubtotal,
      taxAmount: supplierTax,
      totalAmount: supplierTotal,
      amountArs: supplierTotal,
    },
    create: {
      id: DOCS_GUIDE_IDS.supplierInvoiceDraftId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      supplierContactId: ctx.subcontractorId,
      subcontractCertificationId: DOCS_GUIDE_IDS.subcontractCertificationId,
      number: 9001,
      invoiceLetter: "B",
      issueDate: new Date("2026-04-05T12:00:00.000Z"),
      dueDate: new Date("2026-05-05T12:00:00.000Z"),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: supplierSubtotal,
      taxAmount: supplierTax,
      totalAmount: supplierTotal,
      amountArs: supplierTotal,
      status: "DRAFT",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.supplierInvoiceLine.upsert({
    where: { id: DOCS_GUIDE_IDS.supplierInvoiceLineId },
    update: {
      description: "Revoque exterior — cert. 1",
      quantity: certCurrentQty,
      unitPrice: linePrice,
      lineSubtotal: certLineTotal,
      lineTax: supplierTax,
      lineTotal: supplierTotal,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0301Id,
    },
    create: {
      id: DOCS_GUIDE_IDS.supplierInvoiceLineId,
      invoiceId: DOCS_GUIDE_IDS.supplierInvoiceDraftId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0301Id,
      description: "Revoque exterior — cert. 1",
      quantity: certCurrentQty,
      unitPrice: linePrice,
      taxRate: "21.0000",
      lineSubtotal: certLineTotal,
      lineTax: supplierTax,
      lineTotal: supplierTotal,
      sortOrder: 0,
    },
  });
}

async function seedCertificationAndSales(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const certQty = "40.0000";
  const unitSale = "4200.0000";
  const periodAmount = money(40 * 4200);

  await prisma.certification.upsert({
    where: { id: DOCS_GUIDE_IDS.certificationId },
    update: {
      status: "APPROVED",
      totalAmount: periodAmount,
      issueDate: new Date("2026-04-01T12:00:00.000Z"),
    },
    create: {
      id: DOCS_GUIDE_IDS.certificationId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      budgetId: DOCS_GUIDE_IDS.budgetId,
      number: 1,
      periodStart: new Date("2026-03-01T12:00:00.000Z"),
      periodEnd: new Date("2026-03-31T12:00:00.000Z"),
      issueDate: new Date("2026-04-01T12:00:00.000Z"),
      status: "APPROVED",
      totalAmount: periodAmount,
      notes: "Certificación cliente demo aprobada pendiente de factura.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.certificationLine.upsert({
    where: { id: DOCS_GUIDE_IDS.certificationLineId },
    update: {
      currentQty: certQty,
      cumulativeQty: certQty,
      periodAmount,
    },
    create: {
      id: DOCS_GUIDE_IDS.certificationLineId,
      certificationId: DOCS_GUIDE_IDS.certificationId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
      unitSalePriceSnapshot: unitSale,
      budgetQty: "120.0000",
      physicalPct: "33.3333",
      previousQty: "0.0000",
      currentQty: certQty,
      cumulativeQty: certQty,
      periodAmount,
      sortOrder: 0,
    },
  });

  const invoiceSubtotal = periodAmount;
  const invoiceTax = money(parseFloat(periodAmount) * 0.21);
  const invoiceTotal = money(parseFloat(periodAmount) * 1.21);

  await prisma.salesInvoice.upsert({
    where: { id: DOCS_GUIDE_IDS.salesInvoiceId },
    update: {
      status: "ISSUED",
      invoiceLetter: "B",
      subtotal: invoiceSubtotal,
      taxAmount: invoiceTax,
      totalAmount: invoiceTotal,
      amountArs: invoiceTotal,
    },
    create: {
      id: DOCS_GUIDE_IDS.salesInvoiceId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      clientContactId: ctx.clientId,
      number: 1001,
      invoiceLetter: "B",
      issueDate: new Date("2026-04-10T12:00:00.000Z"),
      dueDate: new Date("2026-05-10T12:00:00.000Z"),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: invoiceSubtotal,
      taxAmount: invoiceTax,
      totalAmount: invoiceTotal,
      amountArs: invoiceTotal,
      status: "ISSUED",
      notes: "Factura venta demo emitida con CxC abierta.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.salesInvoiceLine.upsert({
    where: { id: DOCS_GUIDE_IDS.salesInvoiceLineId },
    update: {
      description: "Certificación 1 — excavación",
      quantity: certQty,
      unitPrice: unitSale,
      lineSubtotal: invoiceSubtotal,
      lineTax: invoiceTax,
      lineTotal: invoiceTotal,
    },
    create: {
      id: DOCS_GUIDE_IDS.salesInvoiceLineId,
      invoiceId: DOCS_GUIDE_IDS.salesInvoiceId,
      description: "Certificación 1 — excavación",
      quantity: certQty,
      unitPrice: unitSale,
      taxRate: "21.0000",
      lineSubtotal: invoiceSubtotal,
      lineTax: invoiceTax,
      lineTotal: invoiceTotal,
      sortOrder: 0,
    },
  });

  await prisma.receivable.upsert({
    where: { id: DOCS_GUIDE_IDS.receivableId },
    update: {
      originalAmount: invoiceTotal,
      status: "OPEN",
      paidAmount: "0.0000",
    },
    create: {
      id: DOCS_GUIDE_IDS.receivableId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      clientContactId: ctx.clientId,
      salesInvoiceId: DOCS_GUIDE_IDS.salesInvoiceId,
      issueDate: new Date("2026-04-10T12:00:00.000Z"),
      dueDate: new Date("2026-05-10T12:00:00.000Z"),
      currency: "ARS",
      originalAmount: invoiceTotal,
      paidAmount: "0.0000",
      status: "OPEN",
      createdBy: ctx.docsUserId,
    },
  });
}

async function seedJobsiteLog(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  await prisma.jobsiteLog.upsert({
    where: { id: DOCS_GUIDE_IDS.jobsiteLogId },
    update: {
      status: "SUBMITTED",
      title: "Avance semanal — frente norte",
    },
    create: {
      id: DOCS_GUIDE_IDS.jobsiteLogId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      logDate: new Date("2026-03-18T12:00:00.000Z"),
      title: "Avance semanal — frente norte",
      workFront: "Frente norte",
      shift: "Mañana",
      status: "SUBMITTED",
      weather: "Soleado",
      generalNotes: "Avance de excavación y preparación de fundaciones.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.jobsiteLogProgress.upsert({
    where: { id: DOCS_GUIDE_IDS.jobsiteLogProgressId },
    update: {
      quantityCompleted: "18.0000",
      physicalPct: "15.0000",
    },
    create: {
      id: DOCS_GUIDE_IDS.jobsiteLogProgressId,
      jobsiteLogId: DOCS_GUIDE_IDS.jobsiteLogId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
      description: "Excavación sector A",
      quantityCompleted: "18.0000",
      physicalPct: "15.0000",
      sortOrder: 0,
    },
  });
}

async function seedTenantInvitation(prisma: PrismaClient, ctx: SeedCtx): Promise<string> {
  const rawToken = docsInvitationRawToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  await prisma.tenantInvitation.upsert({
    where: { id: DOCS_GUIDE_IDS.tenantInvitationId },
    update: {
      email: DOCS_INVITATION_EMAIL,
      roles: ["VIEWER"],
      status: "PENDING",
      tokenHash,
      expiresAt,
      invitedByUserId: ctx.docsUserId,
      acceptedByUserId: null,
      acceptedAt: null,
      cancelledAt: null,
    },
    create: {
      id: DOCS_GUIDE_IDS.tenantInvitationId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      email: DOCS_INVITATION_EMAIL,
      roles: ["VIEWER"],
      status: "PENDING",
      tokenHash,
      expiresAt,
      invitedByUserId: ctx.docsUserId,
    },
  });

  return rawToken;
}

async function remapLegacyDemoCompanyId(
  prisma: PrismaClient,
  tenantId: string,
  nextCompanyId: string,
): Promise<void> {
  if (nextCompanyId === LEGACY_DEMO_COMPANY_ID) return;
  const legacy = await prisma.company.findUnique({ where: { id: LEGACY_DEMO_COMPANY_ID } });
  if (!legacy || legacy.tenantId !== tenantId) return;

  const whereLegacy = { companyId: LEGACY_DEMO_COMPANY_ID };
  const toNext = { companyId: nextCompanyId };

  const delegates: Array<{ updateMany: (args: { where: { companyId: string }; data: { companyId: string } }) => Promise<unknown> }> = [
    prisma.userMembership,
    prisma.project,
    prisma.budget,
    prisma.certification,
    prisma.salesInvoice,
    prisma.receivable,
    prisma.treasuryAccount,
    prisma.collection,
    prisma.internalTransfer,
    prisma.supplierInvoice,
    prisma.payable,
    prisma.payment,
    prisma.purchaseOrder,
    prisma.purchaseReceipt,
    prisma.purchaseRequest,
    prisma.product,
    prisma.warehouse,
    prisma.stockMovement,
    prisma.subcontract,
    prisma.subcontractCertification,
    prisma.jobsiteLog,
    prisma.warehouseTransfer,
    prisma.tenantInvitation,
    prisma.accountingAccount,
    prisma.journalEntry,
    prisma.accountingMappingRule,
    prisma.auditLog,
    prisma.scheduledReport,
    prisma.bankReconciliation,
    prisma.period,
    prisma.projectOverheadAllocation,
    prisma.overheadPeriodClose,
    prisma.overheadAutoPeriodSnapshot,
  ];

  for (const model of delegates) {
    await model.updateMany({ where: whereLegacy, data: toNext });
  }

  const legacySettings = await prisma.companyProcurementSettings.findUnique({
    where: { companyId: LEGACY_DEMO_COMPANY_ID },
  });
  const nextSettings = await prisma.companyProcurementSettings.findUnique({
    where: { companyId: nextCompanyId },
  });
  if (legacySettings && nextSettings) {
    await prisma.companyProcurementSettings.delete({ where: { companyId: LEGACY_DEMO_COMPANY_ID } });
  } else if (legacySettings) {
    await prisma.companyProcurementSettings.update({
      where: { companyId: LEGACY_DEMO_COMPANY_ID },
      data: { companyId: nextCompanyId },
    });
  }

  await prisma.company.delete({ where: { id: LEGACY_DEMO_COMPANY_ID } });
}

async function seedFieldPmUser(
  prisma: PrismaClient,
  ctx: SeedCtx,
  password: string,
): Promise<void> {
  const pmUser = await prisma.user.upsert({
    where: { email: DOCS_PM_EMAIL },
    update: {
      name: "Jefe de obra Demo",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
    create: {
      email: DOCS_PM_EMAIL,
      name: "Jefe de obra Demo",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });

  if (password) {
    const passwordHash = await hash(password, 12);
    await prisma.user.update({
      where: { id: pmUser.id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerified: new Date(),
        status: "ACTIVE",
      },
    });
  }

  await prisma.userMembership.upsert({
    where: { userId_tenantId: { userId: pmUser.id, tenantId: ctx.tenantId } },
    update: {
      companyId: ctx.companyId,
      roles: ["PROJECT_MANAGER"],
      status: "ACTIVE",
    },
    create: {
      userId: pmUser.id,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      roles: ["PROJECT_MANAGER"],
      status: "ACTIVE",
    },
  });
}

async function seedFieldViewerUser(
  prisma: PrismaClient,
  ctx: SeedCtx,
  password: string,
): Promise<void> {
  const viewer = await prisma.user.upsert({
    where: { email: DOCS_VIEWER_EMAIL },
    update: {
      name: "Consulta Demo",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
    create: {
      email: DOCS_VIEWER_EMAIL,
      name: "Consulta Demo",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });

  if (password) {
    const passwordHash = await hash(password, 12);
    await prisma.user.update({
      where: { id: viewer.id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerified: new Date(),
        status: "ACTIVE",
      },
    });
  }

  await prisma.userMembership.upsert({
    where: { userId_tenantId: { userId: viewer.id, tenantId: ctx.tenantId } },
    update: {
      companyId: ctx.companyId,
      roles: ["VIEWER"],
      status: "ACTIVE",
    },
    create: {
      userId: viewer.id,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      roles: ["VIEWER"],
      status: "ACTIVE",
    },
  });
}

async function seedSecondDemoProject(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  await prisma.project.upsert({
    where: { id: DOCS_GUIDE_IDS.project2Id },
    update: {
      code: "DEMO-002",
      name: "Ampliación Demo Sur",
      status: "ACTIVE",
      companyId: ctx.companyId,
    },
    create: {
      id: DOCS_GUIDE_IDS.project2Id,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      clientContactId: ctx.clientId,
      code: "DEMO-002",
      name: "Ampliación Demo Sur",
      description: "Segunda obra ficticia para selector de contexto Field.",
      type: "PRIVATE",
      status: "ACTIVE",
      startDate: new Date("2026-06-01T12:00:00.000Z"),
      createdBy: ctx.docsUserId,
    },
  });
}

async function seedFieldPendingEntities(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  const certQty = "8.0000";
  const unitSale = "4200.0000";
  const periodAmount = money(8 * 4200);

  await prisma.certification.upsert({
    where: { id: DOCS_GUIDE_IDS.issuedCertificationId },
    update: {
      status: "ISSUED",
      totalAmount: periodAmount,
      issueDate: new Date("2026-08-01T12:00:00.000Z"),
    },
    create: {
      id: DOCS_GUIDE_IDS.issuedCertificationId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      budgetId: DOCS_GUIDE_IDS.budgetId,
      number: 2,
      periodStart: new Date("2026-07-01T12:00:00.000Z"),
      periodEnd: new Date("2026-07-31T12:00:00.000Z"),
      issueDate: new Date("2026-08-01T12:00:00.000Z"),
      status: "ISSUED",
      totalAmount: periodAmount,
      notes: "Certificación cliente demo emitida, pendiente de aprobación.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.certificationLine.upsert({
    where: { id: DOCS_GUIDE_IDS.issuedCertificationLineId },
    update: {
      currentQty: certQty,
      cumulativeQty: "48.0000",
      previousQty: "40.0000",
      periodAmount,
    },
    create: {
      id: DOCS_GUIDE_IDS.issuedCertificationLineId,
      certificationId: DOCS_GUIDE_IDS.issuedCertificationId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
      unitSalePriceSnapshot: unitSale,
      budgetQty: "120.0000",
      physicalPct: "6.6667",
      previousQty: "40.0000",
      currentQty: certQty,
      cumulativeQty: "48.0000",
      periodAmount,
      sortOrder: 0,
    },
  });

  const subQty = "5.0000";
  const linePrice = "1800.0000";
  const lineTotal = money(5 * 1800);

  await prisma.subcontractCertification.upsert({
    where: { id: DOCS_GUIDE_IDS.issuedSubcontractCertId },
    update: {
      status: "ISSUED",
    },
    create: {
      id: DOCS_GUIDE_IDS.issuedSubcontractCertId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      subcontractId: DOCS_GUIDE_IDS.subcontractId,
      subcontractorContactId: ctx.subcontractorId,
      number: 2,
      periodStart: new Date("2026-07-01T12:00:00.000Z"),
      periodEnd: new Date("2026-07-31T12:00:00.000Z"),
      certificationDate: new Date("2026-08-02T12:00:00.000Z"),
      status: "ISSUED",
      notes: "Certificación de subcontrato demo emitida, pendiente de aprobación.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.subcontractCertificationLine.upsert({
    where: { id: DOCS_GUIDE_IDS.issuedSubcontractCertLineId },
    update: {
      currentQty: subQty,
      cumulativeQty: "40.0000",
      previousQty: "35.0000",
      remainingQty: "60.0000",
      lineTotal,
    },
    create: {
      id: DOCS_GUIDE_IDS.issuedSubcontractCertLineId,
      subcontractCertificationId: DOCS_GUIDE_IDS.issuedSubcontractCertId,
      subcontractLineId: DOCS_GUIDE_IDS.subcontractLineId,
      previousQty: "35.0000",
      currentQty: subQty,
      cumulativeQty: "40.0000",
      remainingQty: "60.0000",
      unitPriceSnapshot: linePrice,
      lineTotal,
      sortOrder: 0,
    },
  });
}

async function seedFieldProcurementCatalog(prisma: PrismaClient, ctx: SeedCtx): Promise<void> {
  await prisma.product.upsert({
    where: { id: DOCS_GUIDE_IDS.productCementId },
    update: {
      sku: "CEM-DEMO-50",
      name: "Cemento Portland demo",
      unit: "bolsa",
      status: "ACTIVE",
      companyId: ctx.companyId,
    },
    create: {
      id: DOCS_GUIDE_IDS.productCementId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      sku: "CEM-DEMO-50",
      name: "Cemento Portland demo",
      description: "Producto ficticio para E2E de campo.",
      unit: "bolsa",
      category: "MATERIALES",
      status: "ACTIVE",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.purchaseOrderLine.update({
    where: { id: DOCS_GUIDE_IDS.confirmedPoLineId },
    data: {
      productId: DOCS_GUIDE_IDS.productCementId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
    },
  });

  await prisma.warehouse.upsert({
    where: { id: DOCS_GUIDE_IDS.warehouseCentralId },
    update: {
      name: "Depósito central demo",
      status: "ACTIVE",
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
    },
    create: {
      id: DOCS_GUIDE_IDS.warehouseCentralId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      name: "Depósito central demo",
      type: "PROJECT",
      status: "ACTIVE",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.stockMovement.upsert({
    where: { id: DOCS_GUIDE_IDS.openingStockId },
    update: {
      quantity: "100.0000",
      status: "CONFIRMED",
      companyId: ctx.companyId,
      warehouseId: DOCS_GUIDE_IDS.warehouseCentralId,
      productId: DOCS_GUIDE_IDS.productCementId,
    },
    create: {
      id: DOCS_GUIDE_IDS.openingStockId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      warehouseId: DOCS_GUIDE_IDS.warehouseCentralId,
      productId: DOCS_GUIDE_IDS.productCementId,
      projectId: DOCS_GUIDE_IDS.projectId,
      type: "IN",
      sourceType: "OPENING_BALANCE",
      sourceId: DOCS_GUIDE_IDS.openingStockId,
      movementDate: new Date("2026-03-01T12:00:00.000Z"),
      quantity: "100.0000",
      status: "CONFIRMED",
      notes: "Saldo inicial ficticio para E2E de consumos.",
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.purchaseRequest.upsert({
    where: { id: DOCS_GUIDE_IDS.purchaseRequestId },
    update: {
      status: "SUBMITTED",
      companyId: ctx.companyId,
      notes: "Solicitud demo enviada para listado mobile.",
    },
    create: {
      id: DOCS_GUIDE_IDS.purchaseRequestId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      number: 1,
      requestedByUserId: ctx.docsUserId,
      neededByDate: new Date("2026-04-15T12:00:00.000Z"),
      status: "SUBMITTED",
      notes: "Solicitud demo enviada para listado mobile.",
      submittedAt: new Date("2026-03-10T12:00:00.000Z"),
      createdBy: ctx.docsUserId,
    },
  });

  await prisma.purchaseRequestLine.upsert({
    where: { id: DOCS_GUIDE_IDS.purchaseRequestLineId },
    update: {
      description: "Malla sima demo",
      quantity: "20.0000",
      unit: "m2",
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
    },
    create: {
      id: DOCS_GUIDE_IDS.purchaseRequestLineId,
      purchaseRequestId: DOCS_GUIDE_IDS.purchaseRequestId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
      lineType: "MATERIAL",
      description: "Malla sima demo",
      unit: "m2",
      quantity: "20.0000",
      sortOrder: 0,
    },
  });

  const submittedQty = "8.0000";
  const submittedPrice = "2200.0000";
  const submittedSubtotal = "17600.0000";
  const submittedTax = "3696.0000";
  const submittedTotal = "21296.0000";

  await prisma.purchaseOrder.upsert({
    where: { id: DOCS_GUIDE_IDS.submittedPoId },
    update: {
      status: "SUBMITTED",
      companyId: ctx.companyId,
      supplierContactId: ctx.supplierId,
      subtotal: submittedSubtotal,
      taxAmount: submittedTax,
      totalAmount: submittedTotal,
      totalAmountArs: submittedTotal,
      returnReason: null,
      returnedAt: null,
      returnedByUserId: null,
      approvedByUserId: null,
      approvedAt: null,
    },
    create: {
      id: DOCS_GUIDE_IDS.submittedPoId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      supplierContactId: ctx.supplierId,
      number: 2,
      issueDate: new Date("2026-03-12T12:00:00.000Z"),
      expectedDeliveryDate: new Date("2026-03-28T12:00:00.000Z"),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: submittedSubtotal,
      taxAmount: submittedTax,
      totalAmount: submittedTotal,
      totalAmountArs: submittedTotal,
      status: "SUBMITTED",
      notes: "OC demo pendiente de aprobación.",
      createdBy: ctx.docsUserId,
      originRequestedByUserId: ctx.docsUserId,
    },
  });

  await prisma.purchaseOrderLine.upsert({
    where: { id: DOCS_GUIDE_IDS.submittedPoLineId },
    update: {
      description: "Hierro ADN 420 demo",
      quantity: submittedQty,
      unitPrice: submittedPrice,
      lineSubtotal: submittedSubtotal,
      lineTax: submittedTax,
      lineTotal: submittedTotal,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
    },
    create: {
      id: DOCS_GUIDE_IDS.submittedPoLineId,
      purchaseOrderId: DOCS_GUIDE_IDS.submittedPoId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0101Id,
      description: "Hierro ADN 420 demo",
      unit: "kg",
      quantity: submittedQty,
      unitPrice: submittedPrice,
      lineSubtotal: submittedSubtotal,
      lineTax: submittedTax,
      lineTotal: submittedTotal,
      sortOrder: 0,
    },
  });

  const returnQty = "4.0000";
  const returnPrice = "1800.0000";
  const returnSubtotal = "7200.0000";
  const returnTax = "1512.0000";
  const returnTotal = "8712.0000";

  await prisma.purchaseOrder.upsert({
    where: { id: DOCS_GUIDE_IDS.returnPoId },
    update: {
      status: "SUBMITTED",
      companyId: ctx.companyId,
      supplierContactId: ctx.supplierId,
      subtotal: returnSubtotal,
      taxAmount: returnTax,
      totalAmount: returnTotal,
      totalAmountArs: returnTotal,
      returnReason: null,
      returnedAt: null,
      returnedByUserId: null,
      approvedByUserId: null,
      approvedAt: null,
    },
    create: {
      id: DOCS_GUIDE_IDS.returnPoId,
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      projectId: DOCS_GUIDE_IDS.projectId,
      supplierContactId: ctx.supplierId,
      number: 3,
      issueDate: new Date("2026-03-13T12:00:00.000Z"),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: returnSubtotal,
      taxAmount: returnTax,
      totalAmount: returnTotal,
      totalAmountArs: returnTotal,
      status: "SUBMITTED",
      notes: "OC demo para devolver con motivo.",
      createdBy: ctx.docsUserId,
      originRequestedByUserId: ctx.docsUserId,
    },
  });

  await prisma.purchaseOrderLine.upsert({
    where: { id: DOCS_GUIDE_IDS.returnPoLineId },
    update: {
      description: "Cal hidráulica demo",
      quantity: returnQty,
      unitPrice: returnPrice,
      lineSubtotal: returnSubtotal,
      lineTax: returnTax,
      lineTotal: returnTotal,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0102Id,
    },
    create: {
      id: DOCS_GUIDE_IDS.returnPoLineId,
      purchaseOrderId: DOCS_GUIDE_IDS.returnPoId,
      wbsNodeId: DOCS_GUIDE_IDS.wbsItem0102Id,
      description: "Cal hidráulica demo",
      unit: "bolsa",
      quantity: returnQty,
      unitPrice: returnPrice,
      lineSubtotal: returnSubtotal,
      lineTax: returnTax,
      lineTotal: returnTotal,
      sortOrder: 0,
    },
  });
}

export async function seedDocsGuideDataset(prisma: PrismaClient): Promise<void> {
  const docsEmail = (process.env.DOCS_USER_EMAIL || "docs-guide@bloqer.demo").trim().toLowerCase();
  const password = (process.env.DOCS_USER_PASSWORD || process.env.SEED_USER_PASSWORD || "").trim();

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: DOCS_TENANT_NAME },
    create: {
      name: DOCS_TENANT_NAME,
      slug: "demo",
      timezone: "America/Argentina/Buenos_Aires",
      baseCurrency: "ARS",
    },
  });

  const company = await prisma.company.upsert({
    where: { id: DOCS_GUIDE_IDS.companyId },
    update: { name: DOCS_TENANT_NAME, tenantId: tenant.id, status: "ACTIVE" },
    create: {
      id: DOCS_GUIDE_IDS.companyId,
      tenantId: tenant.id,
      name: DOCS_TENANT_NAME,
      status: "ACTIVE",
    },
  });
  await remapLegacyDemoCompanyId(prisma, tenant.id, company.id);

  const docsUser = await prisma.user.upsert({
    where: { email: docsEmail },
    update: {
      name: "Usuario Guía Demo",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
    create: {
      email: docsEmail,
      name: "Usuario Guía Demo",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });

  if (password) {
    const passwordHash = await hash(password, 12);
    await prisma.user.update({
      where: { id: docsUser.id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerified: new Date(),
        status: "ACTIVE",
      },
    });
  }

  await prisma.userMembership.upsert({
    where: { userId_tenantId: { userId: docsUser.id, tenantId: tenant.id } },
    update: {
      companyId: company.id,
      roles: ["OWNER"],
      status: "ACTIVE",
    },
    create: {
      userId: docsUser.id,
      tenantId: tenant.id,
      companyId: company.id,
      roles: ["OWNER"],
      status: "ACTIVE",
    },
  });

  const client = await prisma.contact.upsert({
    where: { id: DOCS_GUIDE_IDS.clientContactId },
    update: {
      legalName: "Cliente Demo SA",
      fantasyName: "Cliente Demo",
      taxId: FAKE_CLIENT_TAX_ID,
      taxIdType: "CUIT",
      ivaCondition: "RESPONSIBLE_INSCRIPTO",
      email: "cliente.demo@bloqer.test",
      status: "ACTIVE",
    },
    create: {
      id: DOCS_GUIDE_IDS.clientContactId,
      tenantId: tenant.id,
      legalName: "Cliente Demo SA",
      fantasyName: "Cliente Demo",
      taxId: FAKE_CLIENT_TAX_ID,
      taxIdType: "CUIT",
      ivaCondition: "RESPONSIBLE_INSCRIPTO",
      email: "cliente.demo@bloqer.test",
      status: "ACTIVE",
      createdBy: docsUser.id,
    },
  });

  await prisma.contactRole.upsert({
    where: { contactId_role: { contactId: client.id, role: "CLIENT" } },
    update: { status: "ACTIVE" },
    create: { contactId: client.id, tenantId: tenant.id, role: "CLIENT", status: "ACTIVE" },
  });

  await prisma.clientProfile.upsert({
    where: { contactId: client.id },
    update: {},
    create: { contactId: client.id },
  });

  const supplier = await prisma.contact.upsert({
    where: { id: DOCS_GUIDE_IDS.supplierContactId },
    update: {
      legalName: "Proveedor Demo SRL",
      fantasyName: "Proveedor Demo",
      taxId: FAKE_SUPPLIER_TAX_ID,
      taxIdType: "CUIT",
      ivaCondition: "RESPONSIBLE_INSCRIPTO",
      email: "proveedor.demo@bloqer.test",
      status: "ACTIVE",
    },
    create: {
      id: DOCS_GUIDE_IDS.supplierContactId,
      tenantId: tenant.id,
      legalName: "Proveedor Demo SRL",
      fantasyName: "Proveedor Demo",
      taxId: FAKE_SUPPLIER_TAX_ID,
      taxIdType: "CUIT",
      ivaCondition: "RESPONSIBLE_INSCRIPTO",
      email: "proveedor.demo@bloqer.test",
      status: "ACTIVE",
      createdBy: docsUser.id,
    },
  });

  await prisma.contactRole.upsert({
    where: { contactId_role: { contactId: supplier.id, role: "SUPPLIER" } },
    update: { status: "ACTIVE" },
    create: { contactId: supplier.id, tenantId: tenant.id, role: "SUPPLIER", status: "ACTIVE" },
  });

  await prisma.supplierProfile.upsert({
    where: { contactId: supplier.id },
    update: {},
    create: { contactId: supplier.id },
  });

  const subcontractor = await prisma.contact.upsert({
    where: { id: DOCS_GUIDE_IDS.subcontractorContactId },
    update: {
      legalName: "Subcontratista Demo SAS",
      fantasyName: "Subcontratista Demo",
      taxId: FAKE_SUBCONTRACTOR_TAX_ID,
      taxIdType: "CUIT",
      ivaCondition: "RESPONSIBLE_INSCRIPTO",
      email: "subcontrato.demo@bloqer.test",
      status: "ACTIVE",
    },
    create: {
      id: DOCS_GUIDE_IDS.subcontractorContactId,
      tenantId: tenant.id,
      legalName: "Subcontratista Demo SAS",
      fantasyName: "Subcontratista Demo",
      taxId: FAKE_SUBCONTRACTOR_TAX_ID,
      taxIdType: "CUIT",
      ivaCondition: "RESPONSIBLE_INSCRIPTO",
      email: "subcontrato.demo@bloqer.test",
      status: "ACTIVE",
      createdBy: docsUser.id,
    },
  });

  await prisma.contactRole.upsert({
    where: { contactId_role: { contactId: subcontractor.id, role: "SUBCONTRACTOR" } },
    update: { status: "ACTIVE" },
    create: {
      contactId: subcontractor.id,
      tenantId: tenant.id,
      role: "SUBCONTRACTOR",
      status: "ACTIVE",
    },
  });

  await prisma.subcontractorProfile.upsert({
    where: { contactId: subcontractor.id },
    update: {},
    create: { contactId: subcontractor.id },
  });

  const seedCtx: SeedCtx = {
    tenantId: tenant.id,
    companyId: company.id,
    docsUserId: docsUser.id,
    clientId: client.id,
    supplierId: supplier.id,
    subcontractorId: subcontractor.id,
  };

  await seedFieldPmUser(prisma, seedCtx, password);
  await seedFieldViewerUser(prisma, seedCtx, password);

  const projectStart = new Date("2026-01-15T12:00:00.000Z");
  await prisma.project.upsert({
    where: { id: DOCS_GUIDE_IDS.projectId },
    update: {
      name: "Obra Demo Norte",
      code: "DEMO-001",
      status: "ACTIVE",
      clientContactId: client.id,
      companyId: company.id,
    },
    create: {
      id: DOCS_GUIDE_IDS.projectId,
      tenantId: tenant.id,
      companyId: company.id,
      clientContactId: client.id,
      code: "DEMO-001",
      name: "Obra Demo Norte",
      description: "Proyecto ficticio para capturas de la guía operativa.",
      type: "PRIVATE",
      status: "ACTIVE",
      startDate: projectStart,
      expectedEndDate: new Date("2026-12-15T12:00:00.000Z"),
      createdBy: docsUser.id,
    },
  });

  await prisma.schedule.upsert({
    where: { projectId: DOCS_GUIDE_IDS.projectId },
    update: { tenantId: tenant.id },
    create: {
      id: DOCS_GUIDE_IDS.scheduleId,
      tenantId: tenant.id,
      projectId: DOCS_GUIDE_IDS.projectId,
      type: "HYBRID",
      createdBy: docsUser.id,
    },
  });

  const taskNames = [
    "Movimiento de suelos",
    "Fundaciones",
    "Estructura planta baja",
    "Estructura planta alta",
    "Instalaciones",
    "Terminaciones",
  ];

  const itemIds: string[] = [];
  for (let i = 0; i < taskNames.length; i++) {
    const id = `0000000${i + 1}-0000-4000-8000-00000000010${i}`;
    itemIds.push(id);
    const { start, end, duration } = scheduleTaskDates(projectStart, i * 14, 10);
    await prisma.scheduleItem.upsert({
      where: { id },
      update: {
        name: taskNames[i]!,
        sortOrder: i,
        startDate: start,
        endDate: end,
        durationDays: duration,
        status: "PLANNED",
      },
      create: {
        id,
        tenantId: tenant.id,
        scheduleId: DOCS_GUIDE_IDS.scheduleId,
        name: taskNames[i]!,
        type: i === 3 ? "MILESTONE" : "TASK",
        sortOrder: i,
        startDate: start,
        endDate: end,
        durationDays: duration,
        status: "PLANNED",
        createdBy: docsUser.id,
      },
    });
  }

  if (itemIds.length >= 2) {
    await prisma.scheduleItemDependency.upsert({
      where: {
        predecessorId_successorId: {
          predecessorId: itemIds[0]!,
          successorId: itemIds[1]!,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        predecessorId: itemIds[0]!,
        successorId: itemIds[1]!,
        type: "FS",
      },
    });
  }

  const issueDate = new Date("2026-03-01T12:00:00.000Z");
  const lineQty = "10.0000";
  const linePrice = "1500.0000";
  const lineSubtotal = "15000.0000";
  const lineTax = "3150.0000";
  const lineTotal = "18150.0000";

  await prisma.purchaseOrder.upsert({
    where: { id: DOCS_GUIDE_IDS.confirmedPoId },
    update: {
      status: "CONFIRMED",
      supplierContactId: supplier.id,
      confirmedByUserId: docsUser.id,
      confirmedAt: new Date("2026-03-05T12:00:00.000Z"),
      subtotal: lineSubtotal,
      taxAmount: lineTax,
      totalAmount: lineTotal,
      totalAmountArs: lineTotal,
    },
    create: {
      id: DOCS_GUIDE_IDS.confirmedPoId,
      tenantId: tenant.id,
      companyId: company.id,
      projectId: DOCS_GUIDE_IDS.projectId,
      supplierContactId: supplier.id,
      number: 1,
      issueDate,
      expectedDeliveryDate: new Date("2026-03-20T12:00:00.000Z"),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: lineSubtotal,
      taxAmount: lineTax,
      totalAmount: lineTotal,
      totalAmountArs: lineTotal,
      status: "CONFIRMED",
      approvedByUserId: docsUser.id,
      approvedAt: new Date("2026-03-04T12:00:00.000Z"),
      confirmedByUserId: docsUser.id,
      confirmedAt: new Date("2026-03-05T12:00:00.000Z"),
      notes: "OC demo confirmada para guía operativa.",
      createdBy: docsUser.id,
    },
  });

  const poLineId = DOCS_GUIDE_IDS.confirmedPoLineId;
  await prisma.purchaseOrderLine.upsert({
    where: { id: poLineId },
    update: {
      description: "Cemento Portland demo",
      quantity: lineQty,
      unitPrice: linePrice,
      lineSubtotal,
      lineTax,
      lineTotal,
    },
    create: {
      id: poLineId,
      purchaseOrderId: DOCS_GUIDE_IDS.confirmedPoId,
      description: "Cemento Portland demo",
      unit: "bolsa",
      quantity: lineQty,
      unitPrice: linePrice,
      lineSubtotal,
      lineTax,
      lineTotal,
      sortOrder: 0,
    },
  });

  await seedBudgetAndWbs(prisma, seedCtx);
  await prisma.schedule.update({
    where: { projectId: DOCS_GUIDE_IDS.projectId },
    data: { baselineBudgetId: DOCS_GUIDE_IDS.budgetId },
  });
  await seedFieldProcurementCatalog(prisma, seedCtx);
  await seedTreasury(prisma, seedCtx);
  await seedSubcontractChain(prisma, seedCtx);
  await seedCertificationAndSales(prisma, seedCtx);
  await seedJobsiteLog(prisma, seedCtx);
  await seedSecondDemoProject(prisma, seedCtx);
  await seedFieldPendingEntities(prisma, seedCtx);
  await seedTenantInvitation(prisma, seedCtx);

  const idsPath = path.resolve(__dirname, "../../../docs/bloqer2.0/guides/docs-demo-ids.json");
  fs.mkdirSync(path.dirname(idsPath), { recursive: true });
  fs.writeFileSync(
    idsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        docsUserEmail: docsEmail,
        fieldPmEmail: DOCS_PM_EMAIL,
        fieldViewerEmail: DOCS_VIEWER_EMAIL,
        invitationEmail: DOCS_INVITATION_EMAIL,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        ...DOCS_GUIDE_IDS,
        companyId: company.id,
        accountId: DOCS_GUIDE_IDS.treasuryAccountId,
        reconciliationId: DOCS_GUIDE_IDS.reconciliationInProgressId,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(`Docs guide dataset seeded for ${docsEmail} (tenant=${tenant.slug})`);
  console.log(`  projectId=${DOCS_GUIDE_IDS.projectId}`);
  console.log(`  budgetId=${DOCS_GUIDE_IDS.budgetId}`);
  console.log(`  reconciliationId=${DOCS_GUIDE_IDS.reconciliationInProgressId}`);
  console.log(`  ids file: ${idsPath}`);
}
