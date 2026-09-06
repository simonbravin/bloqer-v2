/**
 * D-111 Phase B — MEMBERSHIP_SCOPED fixtures on Neon DEV (idempotent).
 * Builds on adversarial tenants, then:
 * - Tenant A → MEMBERSHIP_SCOPED
 * - Distinct A1/A2 operational + financial data
 * - Memberships: PM-A1→A1, PM-A2→A2, VIEWER→A1, viewerNoProc→A1
 * - Extra users: FINANCE, TREASURER, empty-PM
 *
 * Never run against production.
 */
import type { PrismaClient, UserRole } from "@bloqer/database";
import { AI_ADV } from "./adversarial-ids";
import {
  seedAiAdversarialFixtures,
  type AiAdversarialFixtureResult,
} from "./seed-adversarial-tenants";
import { clearProjectAccessModeCache } from "../../security/access";

function money(n: number): string {
  return n.toFixed(4);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function upsertUser(
  prisma: PrismaClient,
  opts: { id: string; email: string; name: string },
): Promise<string> {
  const { hash } = await import("bcryptjs");
  const password =
    process.env.BLOQER_AI_E2E_PASSWORD?.trim() || "bloqer-ai-e2e-local-only";
  const passwordHash = await hash(password, 10);
  const byId = await prisma.user.findUnique({ where: { id: opts.id }, select: { id: true } });
  if (byId) {
    await prisma.user.update({
      where: { id: opts.id },
      data: {
        email: opts.email,
        name: opts.name,
        status: "ACTIVE",
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerified: new Date(),
      },
    });
    return opts.id;
  }
  const byEmail = await prisma.user.findUnique({ where: { email: opts.email }, select: { id: true } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        name: opts.name,
        status: "ACTIVE",
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerified: new Date(),
      },
    });
    return byEmail.id;
  }
  await prisma.user.create({
    data: {
      id: opts.id,
      email: opts.email,
      name: opts.name,
      status: "ACTIVE",
      passwordHash,
      passwordUpdatedAt: new Date(),
      emailVerified: new Date(),
    },
  });
  return opts.id;
}

async function ensureMembership(
  prisma: PrismaClient,
  opts: {
    userId: string;
    email: string;
    tenantId: string;
    companyId: string;
    roles: UserRole[];
  },
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: opts.email }, select: { id: true } });
  const userId = user?.id ?? opts.userId;
  await prisma.userMembership.upsert({
    where: { userId_tenantId: { userId, tenantId: opts.tenantId } },
    update: { roles: opts.roles, status: "ACTIVE", companyId: opts.companyId },
    create: {
      userId,
      tenantId: opts.tenantId,
      companyId: opts.companyId,
      roles: opts.roles,
      status: "ACTIVE",
    },
  });
  return userId;
}

async function ensureProjectMembership(
  prisma: PrismaClient,
  opts: { tenantId: string; projectId: string; userId: string; createdBy: string },
): Promise<void> {
  await prisma.projectMembership.upsert({
    where: {
      tenantId_projectId_userId: {
        tenantId: opts.tenantId,
        projectId: opts.projectId,
        userId: opts.userId,
      },
    },
    update: {},
    create: {
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      userId: opts.userId,
      createdBy: opts.createdBy,
    },
  });
}

export type D111ScopedFixtureResult = AiAdversarialFixtureResult & {
  mode: "MEMBERSHIP_SCOPED";
  pmA2UserId: string;
  financeAUserId: string;
  treasurerAUserId: string;
  emptyPmAUserId: string;
  viewerNoProcAUserId: string;
  poA2Ids: string[];
  payableA1Amount: number;
  payableA2Amount: number;
  payableA2Id: string;
  prA2Id: string;
  receiptA2Id: string;
  jobsiteLogA2Id: string;
  certificationA2Id: string;
  documentA1Id: string;
  documentA2Id: string;
  receivableA2Id: string;
  delayedTaskA2Ids: string[];
};

/**
 * Seed adversarial base + D-111 SCOPED enrichment on Tenant A.
 */
export async function seedD111ScopedFixtures(
  prisma: PrismaClient,
): Promise<D111ScopedFixtureResult> {
  const base = await seedAiAdversarialFixtures(prisma);
  const a = AI_ADV.tenantA;
  const tenantId = base.tenantAId;
  const companyId = a.companyId;
  const ownerId = base.ownerAUserId;

  // ── Users ──────────────────────────────────────────────────────────────────
  await upsertUser(prisma, {
    id: a.pmA2UserId,
    email: AI_ADV.emails.pmA2,
    name: "AI Adv PM A2",
  });
  const pmA2UserId = await ensureMembership(prisma, {
    userId: a.pmA2UserId,
    email: AI_ADV.emails.pmA2,
    tenantId,
    companyId,
    roles: ["PROJECT_MANAGER"],
  });

  await upsertUser(prisma, {
    id: a.financeUserId,
    email: AI_ADV.emails.financeA,
    name: "AI Adv Finance A",
  });
  const financeAUserId = await ensureMembership(prisma, {
    userId: a.financeUserId,
    email: AI_ADV.emails.financeA,
    tenantId,
    companyId,
    roles: ["FINANCE"],
  });

  await upsertUser(prisma, {
    id: a.treasurerUserId,
    email: AI_ADV.emails.treasurerA,
    name: "AI Adv Treasurer A",
  });
  const treasurerAUserId = await ensureMembership(prisma, {
    userId: a.treasurerUserId,
    email: AI_ADV.emails.treasurerA,
    tenantId,
    companyId,
    roles: ["TREASURER"],
  });

  await upsertUser(prisma, {
    id: a.emptyPmUserId,
    email: AI_ADV.emails.emptyPmA,
    name: "AI Adv Empty PM A",
  });
  const emptyPmAUserId = await ensureMembership(prisma, {
    userId: a.emptyPmUserId,
    email: AI_ADV.emails.emptyPmA,
    tenantId,
    companyId,
    roles: ["PROJECT_MANAGER"],
  });

  await upsertUser(prisma, {
    id: a.viewerNoProcUserId,
    email: AI_ADV.emails.viewerNoProcA,
    name: "AI Adv Viewer NoProc A",
  });
  const viewerNoProcAUserId = await ensureMembership(prisma, {
    userId: a.viewerNoProcUserId,
    email: AI_ADV.emails.viewerNoProcA,
    tenantId,
    companyId,
    roles: ["PROJECT_VIEWER"],
  });

  // ── Project A2 rename + enrichment ─────────────────────────────────────────
  await prisma.project.update({
    where: { id: a.projectA2Id },
    data: {
      name: "Obra AI Adv A2",
      code: "AIA-A2",
      status: "ACTIVE",
    },
  });

  await prisma.product.upsert({
    where: { id: a.productA2Id },
    update: { name: "Acero AI Adv A2", tenantId, companyId },
    create: {
      id: a.productA2Id,
      tenantId,
      companyId,
      sku: "AI-ADV-A2-STEEL",
      name: "Acero AI Adv A2",
      unit: "kg",
      status: "ACTIVE",
    },
  });

  await prisma.schedule.upsert({
    where: { id: a.scheduleA2Id },
    update: { tenantId, projectId: a.projectA2Id },
    create: {
      id: a.scheduleA2Id,
      tenantId,
      projectId: a.projectA2Id,
      type: "HYBRID",
      createdBy: ownerId,
    },
  });

  for (let i = 0; i < a.delayedTaskA2Ids.length; i++) {
    const id = a.delayedTaskA2Ids[i]!;
    await prisma.scheduleItem.upsert({
      where: { id },
      update: {
        name: `Tarea atrasada A2 #${i + 1}`,
        status: "IN_PROGRESS",
        startDate: daysAgo(20 + i),
        endDate: daysAgo(5 + i),
        progressPct: "10.00",
      },
      create: {
        id,
        tenantId,
        scheduleId: a.scheduleA2Id,
        name: `Tarea atrasada A2 #${i + 1}`,
        type: "TASK",
        status: "IN_PROGRESS",
        startDate: daysAgo(20 + i),
        endDate: daysAgo(5 + i),
        durationDays: 15,
        progressPct: "10.00",
      },
    });
  }

  await prisma.purchaseRequest.upsert({
    where: { id: a.prA2Id },
    update: {
      status: "SUBMITTED",
      projectId: a.projectA2Id,
      tenantId,
      companyId,
      notes: "SC A2 D-111",
    },
    create: {
      id: a.prA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      number: 9102,
      status: "SUBMITTED",
      neededByDate: daysFromNow(5),
      submittedAt: daysAgo(1),
      notes: "SC A2 D-111",
      createdBy: ownerId,
      requestedByUserId: ownerId,
    },
  });
  await prisma.purchaseRequestLine.upsert({
    where: { id: a.prA2LineId },
    update: { description: "Acero A2", productId: a.productA2Id },
    create: {
      id: a.prA2LineId,
      purchaseRequestId: a.prA2Id,
      productId: a.productA2Id,
      lineType: "MATERIAL",
      description: "Acero A2",
      unit: "kg",
      quantity: money(500),
      sortOrder: 0,
    },
  });

  // Five pending OCs on A2
  for (let i = 0; i < a.poA2Ids.length; i++) {
    const poId = a.poA2Ids[i]!;
    const lineId = a.poA2LineIds[i]!;
    const sub = money(10_000 * (i + 1));
    const tax = money(2_100 * (i + 1));
    const total = money(12_100 * (i + 1));
    await prisma.purchaseOrder.upsert({
      where: { id: poId },
      update: {
        status: "SUBMITTED",
        projectId: a.projectA2Id,
        tenantId,
        companyId,
        number: 9300 + i,
        subtotal: sub,
        taxAmount: tax,
        totalAmount: total,
        totalAmountArs: total,
        notes: `OC A2 pending #${i + 1}`,
      },
      create: {
        id: poId,
        tenantId,
        companyId,
        projectId: a.projectA2Id,
        supplierContactId: a.supplierContactId,
        number: 9300 + i,
        issueDate: daysAgo(3),
        expectedDeliveryDate: daysFromNow(8),
        currency: "ARS",
        fxRate: "1.000000",
        subtotal: sub,
        taxAmount: tax,
        totalAmount: total,
        totalAmountArs: total,
        status: "SUBMITTED",
        notes: `OC A2 pending #${i + 1}`,
        createdBy: ownerId,
        originRequestedByUserId: ownerId,
      },
    });
    await prisma.purchaseOrderLine.upsert({
      where: { id: lineId },
      update: { description: `Linea OC A2 #${i + 1}`, productId: a.productA2Id },
      create: {
        id: lineId,
        purchaseOrderId: poId,
        productId: a.productA2Id,
        description: `Linea OC A2 #${i + 1}`,
        unit: "kg",
        quantity: money(10 * (i + 1)),
        unitPrice: money(1000),
        taxRate: money(21),
        lineSubtotal: sub,
        lineTax: tax,
        lineTotal: total,
        sortOrder: 0,
      },
    });
  }

  // Ensure A1 has exactly 1 SUBMITTED PO (already from base)
  await prisma.purchaseOrder.update({
    where: { id: a.poId },
    data: { status: "SUBMITTED", projectId: a.projectA1Id },
  });

  await prisma.jobsiteLog.upsert({
    where: { id: a.jobsiteLogA2Id },
    update: {
      title: "Parte A2 D-111",
      status: "SUBMITTED",
      projectId: a.projectA2Id,
      generalNotes: "Jobsite A2 secret",
    },
    create: {
      id: a.jobsiteLogA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      logDate: daysAgo(1),
      title: "Parte A2 D-111",
      status: "SUBMITTED",
      generalNotes: "Jobsite A2 secret",
      createdBy: ownerId,
    },
  });

  await prisma.budget.upsert({
    where: { id: a.budgetA2Id },
    update: { status: "APPROVED", name: "Presupuesto A2", tenantId, projectId: a.projectA2Id },
    create: {
      id: a.budgetA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      versionNumber: 1,
      name: "Presupuesto A2",
      status: "APPROVED",
      currency: "ARS",
      totalCost: money(5_000_000),
      totalSalePrice: money(7_000_000),
      createdBy: ownerId,
    },
  });
  await prisma.wbsNode.upsert({
    where: { id: a.wbsA2Id },
    update: { name: "Partida A2", budgetId: a.budgetA2Id },
    create: {
      id: a.wbsA2Id,
      budgetId: a.budgetA2Id,
      parentId: null,
      code: "01.01",
      name: "Partida A2",
      type: "ITEM",
      sortOrder: 0,
    },
  });

  await prisma.certification.upsert({
    where: { id: a.certificationA2Id },
    update: {
      status: "DRAFT",
      projectId: a.projectA2Id,
      budgetId: a.budgetA2Id,
      notes: "Cert A2 D-111",
    },
    create: {
      id: a.certificationA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      budgetId: a.budgetA2Id,
      number: 1,
      periodStart: daysAgo(30),
      periodEnd: daysAgo(1),
      status: "DRAFT",
      totalAmount: money(500_000),
      notes: "Cert A2 D-111",
      createdBy: ownerId,
    },
  });
  await prisma.certificationLine.upsert({
    where: { id: a.certLineA2Id },
    update: { wbsNodeId: a.wbsA2Id },
    create: {
      id: a.certLineA2Id,
      certificationId: a.certificationA2Id,
      wbsNodeId: a.wbsA2Id,
      unitSalePriceSnapshot: money(7_000_000),
      budgetQty: money(1),
      physicalPct: money(5),
      previousQty: money(0),
      currentQty: money(0.05),
      cumulativeQty: money(0.05),
      periodAmount: money(350_000),
      sortOrder: 0,
    },
  });

  // A1 CxP = 10M ; A2 CxP = 90M
  const a1Amt = money(AI_ADV.amounts.a1Payable);
  const a2Amt = money(AI_ADV.amounts.a2Payable);

  await prisma.supplierInvoice.update({
    where: { id: a.supplierInvoiceId },
    data: {
      totalAmount: a1Amt,
      amountArs: a1Amt,
      subtotal: a1Amt,
      taxAmount: money(0),
      projectId: a.projectA1Id,
      status: "ISSUED",
    },
  });
  await prisma.supplierInvoiceLine.update({
    where: { id: a.supplierInvoiceLineId },
    data: {
      unitPrice: a1Amt,
      lineSubtotal: a1Amt,
      lineTotal: a1Amt,
      lineTax: money(0),
    },
  });
  await prisma.payable.update({
    where: { id: a.payableId },
    data: {
      originalAmount: a1Amt,
      paidAmount: money(0),
      status: "OPEN",
      projectId: a.projectA1Id,
    },
  });

  await prisma.supplierInvoice.upsert({
    where: { id: a.supplierInvoiceA2Id },
    update: {
      status: "ISSUED",
      totalAmount: a2Amt,
      amountArs: a2Amt,
      subtotal: a2Amt,
      projectId: a.projectA2Id,
      tenantId,
      companyId,
    },
    create: {
      id: a.supplierInvoiceA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      supplierContactId: a.supplierContactId,
      number: 9350,
      invoiceLetter: "B",
      issueDate: daysAgo(25),
      dueDate: daysAgo(3),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: a2Amt,
      taxAmount: money(0),
      totalAmount: a2Amt,
      amountArs: a2Amt,
      status: "ISSUED",
      createdBy: ownerId,
    },
  });
  await prisma.supplierInvoiceLine.upsert({
    where: { id: a.supplierInvoiceLineA2Id },
    update: { description: "Factura A2 90M", unitPrice: a2Amt, lineSubtotal: a2Amt, lineTotal: a2Amt },
    create: {
      id: a.supplierInvoiceLineA2Id,
      invoiceId: a.supplierInvoiceA2Id,
      description: "Factura A2 90M",
      quantity: money(1),
      unitPrice: a2Amt,
      taxRate: money(0),
      lineSubtotal: a2Amt,
      lineTax: money(0),
      lineTotal: a2Amt,
      sortOrder: 0,
    },
  });
  await prisma.payable.upsert({
    where: { id: a.payableA2Id },
    update: {
      status: "OPEN",
      originalAmount: a2Amt,
      paidAmount: money(0),
      projectId: a.projectA2Id,
      tenantId,
      companyId,
    },
    create: {
      id: a.payableA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      supplierContactId: a.supplierContactId,
      supplierInvoiceId: a.supplierInvoiceA2Id,
      issueDate: daysAgo(25),
      dueDate: daysAgo(3),
      currency: "ARS",
      originalAmount: a2Amt,
      paidAmount: money(0),
      status: "OPEN",
      createdBy: ownerId,
    },
  });

  const arA2 = money(200_000);
  await prisma.salesInvoice.upsert({
    where: { id: a.salesInvoiceA2Id },
    update: {
      status: "ISSUED",
      totalAmount: arA2,
      amountArs: arA2,
      subtotal: arA2,
      projectId: a.projectA2Id,
    },
    create: {
      id: a.salesInvoiceA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      clientContactId: a.clientContactId,
      number: 9450,
      invoiceLetter: "A",
      issueDate: daysAgo(10),
      dueDate: daysAgo(1),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: arA2,
      taxAmount: money(0),
      totalAmount: arA2,
      amountArs: arA2,
      status: "ISSUED",
      createdBy: ownerId,
    },
  });
  await prisma.salesInvoiceLine.upsert({
    where: { id: a.salesInvoiceLineA2Id },
    update: { description: "Factura cliente A2" },
    create: {
      id: a.salesInvoiceLineA2Id,
      invoiceId: a.salesInvoiceA2Id,
      description: "Factura cliente A2",
      quantity: money(1),
      unitPrice: arA2,
      taxRate: money(0),
      lineSubtotal: arA2,
      lineTax: money(0),
      lineTotal: arA2,
      sortOrder: 0,
    },
  });
  await prisma.receivable.upsert({
    where: { id: a.receivableA2Id },
    update: {
      status: "OPEN",
      originalAmount: arA2,
      paidAmount: money(0),
      projectId: a.projectA2Id,
    },
    create: {
      id: a.receivableA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      clientContactId: a.clientContactId,
      salesInvoiceId: a.salesInvoiceA2Id,
      issueDate: daysAgo(10),
      dueDate: daysAgo(1),
      currency: "ARS",
      originalAmount: arA2,
      paidAmount: money(0),
      status: "OPEN",
      createdBy: ownerId,
    },
  });

  // Documents (metadata only — PLACEHOLDER)
  for (const doc of [
    {
      id: a.documentA1Id,
      projectId: a.projectA1Id,
      name: "doc-a1.pdf",
      key: `tenants/${tenantId}/projects/${a.projectA1Id}/doc-a1.pdf`,
    },
    {
      id: a.documentA2Id,
      projectId: a.projectA2Id,
      name: "doc-a2-secret.pdf",
      key: `tenants/${tenantId}/projects/${a.projectA2Id}/doc-a2-secret.pdf`,
    },
  ]) {
    await prisma.documentAttachment.upsert({
      where: { id: doc.id },
      update: {
        originalFileName: doc.name,
        fileName: doc.name,
        projectId: doc.projectId,
        status: "ACTIVE",
        storageKey: doc.key,
      },
      create: {
        id: doc.id,
        tenantId,
        companyId,
        projectId: doc.projectId,
        originalFileName: doc.name,
        fileName: doc.name,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        storageProvider: "PLACEHOLDER",
        storageKey: doc.key,
        category: "OTHER",
        status: "ACTIVE",
        linkedEntityType: "PROJECT",
        linkedEntityId: doc.projectId,
        uploadedBy: ownerId,
      },
    });
  }

  // Soft receipt entity for get-by-id ACL (DRAFT is enough).
  const receiptPoId = a.poA2Ids[0]!;
  await prisma.purchaseReceipt.upsert({
    where: { id: a.receiptA2Id },
    update: {
      projectId: a.projectA2Id,
      purchaseOrderId: receiptPoId,
      status: "DRAFT",
      tenantId,
      companyId,
      supplierContactId: a.supplierContactId,
    },
    create: {
      id: a.receiptA2Id,
      tenantId,
      companyId,
      projectId: a.projectA2Id,
      purchaseOrderId: receiptPoId,
      supplierContactId: a.supplierContactId,
      receiptDate: daysAgo(1),
      status: "DRAFT",
      createdBy: ownerId,
    },
  });

  // ── Memberships (before activating SCOPED) ─────────────────────────────────
  await ensureProjectMembership(prisma, {
    tenantId,
    projectId: a.projectA1Id,
    userId: base.pmAUserId,
    createdBy: ownerId,
  });
  await ensureProjectMembership(prisma, {
    tenantId,
    projectId: a.projectA2Id,
    userId: pmA2UserId,
    createdBy: ownerId,
  });
  await ensureProjectMembership(prisma, {
    tenantId,
    projectId: a.projectA1Id,
    userId: base.viewerAUserId,
    createdBy: ownerId,
  });
  await ensureProjectMembership(prisma, {
    tenantId,
    projectId: a.projectA1Id,
    userId: viewerNoProcAUserId,
    createdBy: ownerId,
  });

  // Empty PM: delete any accidental memberships
  await prisma.projectMembership.deleteMany({
    where: { tenantId, userId: emptyPmAUserId },
  });

  // FINANCE / TREASURER: no project memberships (company-wide paths only)
  await prisma.projectMembership.deleteMany({
    where: { tenantId, userId: { in: [financeAUserId, treasurerAUserId] } },
  });

  // Activate SCOPED on Tenant A only
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { projectAccessMode: "MEMBERSHIP_SCOPED" },
  });
  clearProjectAccessModeCache();

  // Tenant B stays TENANT_WIDE
  await prisma.tenant.update({
    where: { id: base.tenantBId },
    data: { projectAccessMode: "TENANT_WIDE" },
  });

  return {
    ...base,
    mode: "MEMBERSHIP_SCOPED",
    pmA2UserId,
    financeAUserId,
    treasurerAUserId,
    emptyPmAUserId,
    viewerNoProcAUserId,
    poA2Ids: [...a.poA2Ids],
    payableA1Amount: AI_ADV.amounts.a1Payable,
    payableA2Amount: AI_ADV.amounts.a2Payable,
    payableA2Id: a.payableA2Id,
    prA2Id: a.prA2Id,
    receiptA2Id: a.receiptA2Id,
    jobsiteLogA2Id: a.jobsiteLogA2Id,
    certificationA2Id: a.certificationA2Id,
    documentA1Id: a.documentA1Id,
    documentA2Id: a.documentA2Id,
    receivableA2Id: a.receivableA2Id,
    delayedTaskA2Ids: [...a.delayedTaskA2Ids],
  };
}

/** Restore Tenant A to TENANT_WIDE (regression / cleanup). */
export async function restoreTenantATenantWide(prisma: PrismaClient, tenantAId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantAId },
    data: { projectAccessMode: "TENANT_WIDE" },
  });
  clearProjectAccessModeCache();
}
