/**
 * Idempotent Bloqer AI adversarial fixtures for Neon DEV only.
 * Creates Tenant A (OWNER/PM/VIEWER + Project A1/A2 + demo entities)
 * and Tenant B (OWNER + Project B1 + equivalent entities).
 *
 * Injection strings live in entity text fields as DATA.
 */
import type { PrismaClient } from "@bloqer/database";
import { AI_ADV } from "./adversarial-ids";

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

const MODULES_ON = [
  "PROJECTS",
  "BUDGETS",
  "SCHEDULE",
  "PROCUREMENT",
  "PURCHASE_ORDERS",
  "PURCHASE_REQUESTS",
  "INVENTORY",
  "JOBSITE_LOG",
  "CERTIFICATIONS",
  "AP",
  "AR",
  "TREASURY",
] as const;

async function upsertModules(prisma: PrismaClient, tenantId: string, enabled: boolean): Promise<void> {
  for (const moduleKey of MODULES_ON) {
    await prisma.tenantModuleSetting.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      update: { isEnabled: enabled },
      create: { tenantId, moduleKey, isEnabled: enabled },
    });
  }
}

async function upsertUser(
  prisma: PrismaClient,
  opts: { id: string; email: string; name: string },
): Promise<void> {
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
    return;
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
    return;
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
}

async function ensureMembership(
  prisma: PrismaClient,
  opts: {
    userId: string;
    email: string;
    tenantId: string;
    companyId: string;
    roles: ("OWNER" | "PROJECT_MANAGER" | "VIEWER")[];
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

type TenantBundle = {
  label: "A" | "B";
  tenantId: string;
  companyId: string;
  slug: string;
  name: string;
  ownerUserId: string;
  ownerEmail: string;
  clientContactId: string;
  supplierContactId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  scheduleId: string;
  delayedTaskId: string;
  productId: string;
  prId: string;
  prLineId: string;
  poId: string;
  poLineId: string;
  jobsiteLogId: string;
  budgetId: string;
  wbsItemId: string;
  certificationId: string;
  certLineId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  payableId: string;
  salesInvoiceId: string;
  salesInvoiceLineId: string;
  receivableId: string;
  withInjection: boolean;
};

async function seedTenantBundle(prisma: PrismaClient, b: TenantBundle): Promise<{ ownerUserId: string }> {
  await prisma.tenant.upsert({
    where: { slug: b.slug },
    update: { name: b.name, status: "ACTIVE" },
    create: {
      id: b.tenantId,
      slug: b.slug,
      name: b.name,
      status: "ACTIVE",
      timezone: "America/Argentina/Buenos_Aires",
      baseCurrency: "ARS",
    },
  });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: b.slug } });
  const tenantId = tenant.id;

  await prisma.company.upsert({
    where: { id: b.companyId },
    update: { name: `${b.name} SA`, tenantId },
    create: {
      id: b.companyId,
      tenantId,
      name: `${b.name} SA`,
      status: "ACTIVE",
    },
  });

  await upsertModules(prisma, tenantId, true);

  await upsertUser(prisma, {
    id: b.ownerUserId,
    email: b.ownerEmail,
    name: `AI Adv Owner ${b.label}`,
  });
  const ownerUserId = await ensureMembership(prisma, {
    userId: b.ownerUserId,
    email: b.ownerEmail,
    tenantId,
    companyId: b.companyId,
    roles: ["OWNER"],
  });

  const supplierName = b.withInjection
    ? AI_ADV.injection.supplierLegalName
    : `Proveedor AI Adv ${b.label}`;
  const productName = b.withInjection
    ? AI_ADV.injection.productName
    : `Cemento AI Adv ${b.label}`;
  const poNotes = b.withInjection
    ? AI_ADV.injection.poNotes
    : `OC adversarial tenant ${b.label}`;
  const jobsiteNotes = b.withInjection
    ? AI_ADV.injection.jobsiteNotes
    : `Parte adversarial tenant ${b.label}`;

  await prisma.contact.upsert({
    where: { id: b.clientContactId },
    update: { legalName: `Cliente AI Adv ${b.label}`, status: "ACTIVE", tenantId },
    create: {
      id: b.clientContactId,
      tenantId,
      legalName: `Cliente AI Adv ${b.label}`,
      fantasyName: `Cliente ${b.label}`,
      status: "ACTIVE",
      taxId: b.label === "A" ? "30-71111111-1" : "30-72222222-2",
      taxIdType: "CUIT",
    },
  });
  await prisma.contactRole.upsert({
    where: { contactId_role: { contactId: b.clientContactId, role: "CLIENT" } },
    update: { status: "ACTIVE", tenantId },
    create: {
      contactId: b.clientContactId,
      tenantId,
      role: "CLIENT",
      status: "ACTIVE",
    },
  });
  await prisma.clientProfile.upsert({
    where: { contactId: b.clientContactId },
    update: {},
    create: { contactId: b.clientContactId },
  });

  await prisma.contact.upsert({
    where: { id: b.supplierContactId },
    update: { legalName: supplierName, status: "ACTIVE", tenantId, notes: supplierName },
    create: {
      id: b.supplierContactId,
      tenantId,
      legalName: supplierName,
      fantasyName: `Proveedor ${b.label}`,
      status: "ACTIVE",
      taxId: b.label === "A" ? "30-71111112-9" : "30-72222223-0",
      taxIdType: "CUIT",
      notes: supplierName,
    },
  });
  await prisma.contactRole.upsert({
    where: { contactId_role: { contactId: b.supplierContactId, role: "SUPPLIER" } },
    update: { status: "ACTIVE", tenantId },
    create: {
      contactId: b.supplierContactId,
      tenantId,
      role: "SUPPLIER",
      status: "ACTIVE",
    },
  });
  await prisma.supplierProfile.upsert({
    where: { contactId: b.supplierContactId },
    update: {},
    create: { contactId: b.supplierContactId },
  });

  await prisma.project.upsert({
    where: { id: b.projectId },
    update: {
      name: b.projectName,
      code: b.projectCode,
      status: "ACTIVE",
      tenantId,
      companyId: b.companyId,
      clientContactId: b.clientContactId,
    },
    create: {
      id: b.projectId,
      tenantId,
      companyId: b.companyId,
      clientContactId: b.clientContactId,
      code: b.projectCode,
      name: b.projectName,
      type: "PRIVATE",
      status: "ACTIVE",
      createdBy: ownerUserId,
    },
  });

  await prisma.product.upsert({
    where: { id: b.productId },
    update: { name: productName, sku: `AI-ADV-${b.label}-CEM`, tenantId, companyId: b.companyId },
    create: {
      id: b.productId,
      tenantId,
      companyId: b.companyId,
      sku: `AI-ADV-${b.label}-CEM`,
      name: productName,
      unit: "kg",
      status: "ACTIVE",
    },
  });

  await prisma.schedule.upsert({
    where: { id: b.scheduleId },
    update: { tenantId, projectId: b.projectId },
    create: {
      id: b.scheduleId,
      tenantId,
      projectId: b.projectId,
      type: "HYBRID",
      createdBy: ownerUserId,
    },
  });

  await prisma.scheduleItem.upsert({
    where: { id: b.delayedTaskId },
    update: {
      name: `Tarea atrasada AI Adv ${b.label}`,
      status: "IN_PROGRESS",
      startDate: daysAgo(14),
      endDate: daysAgo(3),
      progressPct: "25.00",
    },
    create: {
      id: b.delayedTaskId,
      tenantId,
      scheduleId: b.scheduleId,
      name: `Tarea atrasada AI Adv ${b.label}`,
      type: "TASK",
      status: "IN_PROGRESS",
      startDate: daysAgo(14),
      endDate: daysAgo(3),
      durationDays: 12,
      progressPct: "25.00",
    },
  });

  await prisma.purchaseRequest.upsert({
    where: { id: b.prId },
    update: {
      status: "SUBMITTED",
      notes: `SC adversarial ${b.label}`,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
    },
    create: {
      id: b.prId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      number: 9101,
      status: "SUBMITTED",
      neededByDate: daysFromNow(7),
      submittedAt: daysAgo(1),
      notes: `SC adversarial ${b.label}`,
      createdBy: ownerUserId,
      requestedByUserId: ownerUserId,
    },
  });
  await prisma.purchaseRequestLine.upsert({
    where: { id: b.prLineId },
    update: { description: productName, productId: b.productId },
    create: {
      id: b.prLineId,
      purchaseRequestId: b.prId,
      productId: b.productId,
      lineType: "MATERIAL",
      description: productName,
      unit: "kg",
      quantity: money(100),
      sortOrder: 0,
    },
  });

  const poSub = money(50_000);
  const poTax = money(10_500);
  const poTotal = money(60_500);
  await prisma.purchaseOrder.upsert({
    where: { id: b.poId },
    update: {
      status: "SUBMITTED",
      notes: poNotes,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      supplierContactId: b.supplierContactId,
      subtotal: poSub,
      taxAmount: poTax,
      totalAmount: poTotal,
      totalAmountArs: poTotal,
    },
    create: {
      id: b.poId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      supplierContactId: b.supplierContactId,
      number: 9201,
      issueDate: daysAgo(2),
      expectedDeliveryDate: daysFromNow(10),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: poSub,
      taxAmount: poTax,
      totalAmount: poTotal,
      totalAmountArs: poTotal,
      status: "SUBMITTED",
      notes: poNotes,
      createdBy: ownerUserId,
      originRequestedByUserId: ownerUserId,
    },
  });
  await prisma.purchaseOrderLine.upsert({
    where: { id: b.poLineId },
    update: { description: productName, productId: b.productId },
    create: {
      id: b.poLineId,
      purchaseOrderId: b.poId,
      productId: b.productId,
      description: productName,
      unit: "kg",
      quantity: money(100),
      unitPrice: money(500),
      taxRate: money(21),
      lineSubtotal: poSub,
      lineTax: poTax,
      lineTotal: poTotal,
      sortOrder: 0,
    },
  });

  await prisma.jobsiteLog.upsert({
    where: { id: b.jobsiteLogId },
    update: {
      generalNotes: jobsiteNotes,
      status: "SUBMITTED",
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
    },
    create: {
      id: b.jobsiteLogId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      logDate: daysAgo(1),
      title: `Parte AI Adv ${b.label}`,
      status: "SUBMITTED",
      generalNotes: jobsiteNotes,
      createdBy: ownerUserId,
    },
  });

  await prisma.budget.upsert({
    where: { id: b.budgetId },
    update: { status: "APPROVED", name: `Presupuesto AI Adv ${b.label}`, tenantId },
    create: {
      id: b.budgetId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      versionNumber: 1,
      name: `Presupuesto AI Adv ${b.label}`,
      status: "APPROVED",
      currency: "ARS",
      totalCost: money(1_000_000),
      totalSalePrice: money(1_400_000),
      createdBy: ownerUserId,
    },
  });

  await prisma.wbsNode.upsert({
    where: { id: b.wbsItemId },
    update: { name: `Partida AI Adv ${b.label}`, budgetId: b.budgetId },
    create: {
      id: b.wbsItemId,
      budgetId: b.budgetId,
      parentId: null,
      code: "01.01",
      name: `Partida AI Adv ${b.label}`,
      type: "ITEM",
      sortOrder: 0,
    },
  });

  await prisma.certification.upsert({
    where: { id: b.certificationId },
    update: { status: "DRAFT", tenantId, projectId: b.projectId, budgetId: b.budgetId },
    create: {
      id: b.certificationId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      budgetId: b.budgetId,
      number: 1,
      periodStart: daysAgo(30),
      periodEnd: daysAgo(1),
      status: "DRAFT",
      totalAmount: money(100_000),
      notes: `Certificación AI Adv ${b.label}`,
      createdBy: ownerUserId,
    },
  });
  await prisma.certificationLine.upsert({
    where: { id: b.certLineId },
    update: {
      wbsNodeId: b.wbsItemId,
      currentQty: money(0.1),
      cumulativeQty: money(0.1),
      periodAmount: money(140_000),
    },
    create: {
      id: b.certLineId,
      certificationId: b.certificationId,
      wbsNodeId: b.wbsItemId,
      unitSalePriceSnapshot: money(1_400_000),
      budgetQty: money(1),
      physicalPct: money(10),
      previousQty: money(0),
      currentQty: money(0.1),
      cumulativeQty: money(0.1),
      periodAmount: money(140_000),
      sortOrder: 0,
    },
  });

  const invTotal = money(75_000);
  await prisma.supplierInvoice.upsert({
    where: { id: b.supplierInvoiceId },
    update: {
      status: "ISSUED",
      totalAmount: invTotal,
      amountArs: invTotal,
      subtotal: invTotal,
      supplierContactId: b.supplierContactId,
      projectId: b.projectId,
      tenantId,
      companyId: b.companyId,
    },
    create: {
      id: b.supplierInvoiceId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      supplierContactId: b.supplierContactId,
      number: 9301,
      invoiceLetter: "B",
      issueDate: daysAgo(20),
      dueDate: daysAgo(5),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: invTotal,
      taxAmount: money(0),
      totalAmount: invTotal,
      amountArs: invTotal,
      status: "ISSUED",
      createdBy: ownerUserId,
    },
  });
  await prisma.supplierInvoiceLine.upsert({
    where: { id: b.supplierInvoiceLineId },
    update: { description: `Factura proveedor AI Adv ${b.label}` },
    create: {
      id: b.supplierInvoiceLineId,
      invoiceId: b.supplierInvoiceId,
      description: `Factura proveedor AI Adv ${b.label}`,
      quantity: money(1),
      unitPrice: invTotal,
      taxRate: money(0),
      lineSubtotal: invTotal,
      lineTax: money(0),
      lineTotal: invTotal,
      sortOrder: 0,
    },
  });
  await prisma.payable.upsert({
    where: { id: b.payableId },
    update: {
      status: "OPEN",
      originalAmount: invTotal,
      paidAmount: money(0),
      dueDate: daysAgo(5),
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      supplierContactId: b.supplierContactId,
    },
    create: {
      id: b.payableId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      supplierContactId: b.supplierContactId,
      supplierInvoiceId: b.supplierInvoiceId,
      issueDate: daysAgo(20),
      dueDate: daysAgo(5),
      currency: "ARS",
      originalAmount: invTotal,
      paidAmount: money(0),
      status: "OPEN",
      createdBy: ownerUserId,
    },
  });

  const arTotal = money(90_000);
  await prisma.salesInvoice.upsert({
    where: { id: b.salesInvoiceId },
    update: {
      status: "ISSUED",
      totalAmount: arTotal,
      amountArs: arTotal,
      subtotal: arTotal,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      clientContactId: b.clientContactId,
    },
    create: {
      id: b.salesInvoiceId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      clientContactId: b.clientContactId,
      number: 9401,
      invoiceLetter: "A",
      issueDate: daysAgo(15),
      dueDate: daysAgo(2),
      currency: "ARS",
      fxRate: "1.000000",
      subtotal: arTotal,
      taxAmount: money(0),
      totalAmount: arTotal,
      amountArs: arTotal,
      status: "ISSUED",
      createdBy: ownerUserId,
    },
  });
  await prisma.salesInvoiceLine.upsert({
    where: { id: b.salesInvoiceLineId },
    update: { description: `Factura cliente AI Adv ${b.label}` },
    create: {
      id: b.salesInvoiceLineId,
      invoiceId: b.salesInvoiceId,
      description: `Factura cliente AI Adv ${b.label}`,
      quantity: money(1),
      unitPrice: arTotal,
      taxRate: money(0),
      lineSubtotal: arTotal,
      lineTax: money(0),
      lineTotal: arTotal,
      sortOrder: 0,
    },
  });
  await prisma.receivable.upsert({
    where: { id: b.receivableId },
    update: {
      status: "OPEN",
      originalAmount: arTotal,
      paidAmount: money(0),
      dueDate: daysAgo(2),
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      clientContactId: b.clientContactId,
    },
    create: {
      id: b.receivableId,
      tenantId,
      companyId: b.companyId,
      projectId: b.projectId,
      clientContactId: b.clientContactId,
      salesInvoiceId: b.salesInvoiceId,
      issueDate: daysAgo(15),
      dueDate: daysAgo(2),
      currency: "ARS",
      originalAmount: arTotal,
      paidAmount: money(0),
      status: "OPEN",
      createdBy: ownerUserId,
    },
  });

  return { ownerUserId };
}

export type AiAdversarialFixtureResult = {
  tenantAId: string;
  tenantBId: string;
  projectA1Id: string;
  projectA2Id: string;
  projectB1Id: string;
  poAId: string;
  poBId: string;
  ownerAUserId: string;
  pmAUserId: string;
  viewerAUserId: string;
  ownerBUserId: string;
};

/**
 * Seeds / refreshes adversarial tenants. Safe to re-run (upserts).
 * Caller must assert non-production DATABASE_URL first.
 */
export async function seedAiAdversarialFixtures(
  prisma: PrismaClient,
): Promise<AiAdversarialFixtureResult> {
  const a = AI_ADV.tenantA;
  const b = AI_ADV.tenantB;

  const { ownerUserId: ownerAUserId } = await seedTenantBundle(prisma, {
    label: "A",
    tenantId: a.tenantId,
    companyId: a.companyId,
    slug: AI_ADV.slugs.tenantA,
    name: "AI Adv Tenant A",
    ownerUserId: a.ownerUserId,
    ownerEmail: AI_ADV.emails.ownerA,
    clientContactId: a.clientContactId,
    supplierContactId: a.supplierContactId,
    projectId: a.projectA1Id,
    projectCode: "AIA-A1",
    projectName: "Obra AI Adv A1",
    scheduleId: a.scheduleA1Id,
    delayedTaskId: a.delayedTaskId,
    productId: a.productId,
    prId: a.prId,
    prLineId: a.prLineId,
    poId: a.poId,
    poLineId: a.poLineId,
    jobsiteLogId: a.jobsiteLogId,
    budgetId: a.budgetId,
    wbsItemId: a.wbsItemId,
    certificationId: a.certificationId,
    certLineId: a.certLineId,
    supplierInvoiceId: a.supplierInvoiceId,
    supplierInvoiceLineId: a.supplierInvoiceLineId,
    payableId: a.payableId,
    salesInvoiceId: a.salesInvoiceId,
    salesInvoiceLineId: a.salesInvoiceLineId,
    receivableId: a.receivableId,
    withInjection: true,
  });

  await upsertUser(prisma, {
    id: a.pmUserId,
    email: AI_ADV.emails.pmA,
    name: "AI Adv PM A",
  });
  const pmAUserId = await ensureMembership(prisma, {
    userId: a.pmUserId,
    email: AI_ADV.emails.pmA,
    tenantId: (await prisma.tenant.findUniqueOrThrow({ where: { slug: AI_ADV.slugs.tenantA } })).id,
    companyId: a.companyId,
    roles: ["PROJECT_MANAGER"],
  });

  await upsertUser(prisma, {
    id: a.viewerUserId,
    email: AI_ADV.emails.viewerA,
    name: "AI Adv Viewer A",
  });
  const viewerAUserId = await ensureMembership(prisma, {
    userId: a.viewerUserId,
    email: AI_ADV.emails.viewerA,
    tenantId: (await prisma.tenant.findUniqueOrThrow({ where: { slug: AI_ADV.slugs.tenantA } })).id,
    companyId: a.companyId,
    roles: ["VIEWER"],
  });

  // Project A2 — same tenant; matrix has no project-scoped ACL (documented in tests).
  await prisma.project.upsert({
    where: { id: a.projectA2Id },
    update: {
      name: "Obra AI Adv A2 (sin ACL de proyecto)",
      code: "AIA-A2",
      status: "ACTIVE",
      companyId: a.companyId,
      clientContactId: a.clientContactId,
    },
    create: {
      id: a.projectA2Id,
      tenantId: (await prisma.tenant.findUniqueOrThrow({ where: { slug: AI_ADV.slugs.tenantA } })).id,
      companyId: a.companyId,
      clientContactId: a.clientContactId,
      code: "AIA-A2",
      name: "Obra AI Adv A2 (sin ACL de proyecto)",
      type: "PRIVATE",
      status: "ACTIVE",
      createdBy: ownerAUserId,
    },
  });

  const { ownerUserId: ownerBUserId } = await seedTenantBundle(prisma, {
    label: "B",
    tenantId: b.tenantId,
    companyId: b.companyId,
    slug: AI_ADV.slugs.tenantB,
    name: "AI Adv Tenant B",
    ownerUserId: b.ownerUserId,
    ownerEmail: AI_ADV.emails.ownerB,
    clientContactId: b.clientContactId,
    supplierContactId: b.supplierContactId,
    projectId: b.projectB1Id,
    projectCode: "AIB-B1",
    projectName: "Obra AI Adv B1 SECRET",
    scheduleId: b.scheduleB1Id,
    delayedTaskId: b.delayedTaskId,
    productId: b.productId,
    prId: b.prId,
    prLineId: b.prLineId,
    poId: b.poId,
    poLineId: b.poLineId,
    jobsiteLogId: b.jobsiteLogId,
    budgetId: b.budgetId,
    wbsItemId: b.wbsItemId,
    certificationId: b.certificationId,
    certLineId: b.certLineId,
    supplierInvoiceId: b.supplierInvoiceId,
    supplierInvoiceLineId: b.supplierInvoiceLineId,
    payableId: b.payableId,
    salesInvoiceId: b.salesInvoiceId,
    salesInvoiceLineId: b.salesInvoiceLineId,
    receivableId: b.receivableId,
    withInjection: false,
  });

  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: AI_ADV.slugs.tenantA } });
  const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { slug: AI_ADV.slugs.tenantB } });

  return {
    tenantAId: tenantA.id,
    tenantBId: tenantB.id,
    projectA1Id: a.projectA1Id,
    projectA2Id: a.projectA2Id,
    projectB1Id: b.projectB1Id,
    poAId: a.poId,
    poBId: b.poId,
    ownerAUserId,
    pmAUserId,
    viewerAUserId,
    ownerBUserId,
  };
}
