/** Maintained AG-08 regressions. The effective isolated-database guard precedes all fixture writes. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import type {
  CreateSubcontractInput,
  CreateSubcontractCertificationInput,
} from "@bloqer/validators";
import { createSupplierInvoiceSchema, registerApExpenseSchema } from "@bloqer/validators";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  createSupplierInvoice,
  issueSupplierInvoice,
  cancelSupplierInvoice,
} from "../ap/supplier-invoice.service";
import {
  createSupplierDebitNoteFromInvoice,
  issueSupplierDebitNote,
} from "../ap/credit-debit-note.service";
import { createPayment, cancelPayment } from "../ap/payment.service";
import { registerApExpense } from "../ap/register-ap-expense.service";
import {
  createSubcontract,
  getSubcontractById,
  listSubcontractsByProject,
  updateSubcontract,
  updateSubcontractMeta,
  activateSubcontract,
  completeSubcontract,
  cancelSubcontract,
  getSubcontractFormWbsPickList,
  listSubcontractorContacts,
} from "./subcontract.service";
import {
  createSubcontractCertification,
  getSubcontractCertificationById,
  listSubcontractCertificationsBySubcontract,
  updateSubcontractCertification,
  issueSubcontractCertification,
  approveSubcontractCertification,
  rejectSubcontractCertification,
  cancelSubcontractCertification,
} from "./subcontract-certification.service";

const denied = (e: unknown) =>
  e instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(e.code);
const conflict = (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT";
const invalid = (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION";
const live = process.env.BLOQER_AUDIT_LIVE === "1";

describe("AG-08 subcontracts on isolated SQL", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(),
    foreignTenantId = randomUUID(),
    companyId = randomUUID(),
    otherCompanyId = randomUUID(),
    foreignCompanyId = randomUUID(),
    actorId = randomUUID(),
    otherActorId = randomUUID(),
    globalActorId = randomUUID(),
    pmId = randomUUID(),
    contactId = randomUUID(),
    foreignContactId = randomUUID(),
    accountId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const global: ServiceContext = { ...ctx, companyId: null, actorUserId: globalActorId };
  const other: ServiceContext = { ...ctx, companyId: otherCompanyId, actorUserId: otherActorId };
  const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
  const foreign: ServiceContext = {
    ...ctx,
    tenantId: foreignTenantId,
    companyId: foreignCompanyId,
  };
  const day = "2026-11-05";
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(
      async (tx) => {
        await tx.tenant.createMany({
          data: [tenantId, foreignTenantId].map((id) => ({
            id,
            name: "Synthetic AG08 subcontracts",
            slug: "audit-subcontracts-" + id,
            projectAccessMode: "MEMBERSHIP_SCOPED" as const,
          })),
        });
        await tx.company.createMany({
          data: [
            {
              id: companyId,
              tenantId,
              name: "Synthetic subcontract A",
              ivaCondition: "RESPONSIBLE_INSCRIPTO",
            },
            {
              id: otherCompanyId,
              tenantId,
              name: "Synthetic subcontract B",
              ivaCondition: "RESPONSIBLE_INSCRIPTO",
            },
            { id: foreignCompanyId, tenantId: foreignTenantId, name: "Synthetic foreign company" },
          ],
        });
        await tx.user.createMany({
          data: [actorId, otherActorId, globalActorId, pmId].map((id) => ({
            id,
            email: "audit-subcontracts-" + id + "@example.test",
          })),
        });
        await tx.userMembership.createMany({
          data: [
            { tenantId, companyId, userId: actorId, roles: ["OWNER"] },
            { tenantId, companyId: otherCompanyId, userId: otherActorId, roles: ["OWNER"] },
            { tenantId, companyId: null, userId: globalActorId, roles: ["OWNER"] },
            { tenantId, companyId, userId: pmId, roles: ["PROJECT_MANAGER"] },
          ],
        });
        for (const [id, tenant] of [
          [contactId, tenantId],
          [foreignContactId, foreignTenantId],
        ]) {
          await tx.contact.create({
            data: {
              id: id!,
              tenantId: tenant!,
              legalName: "Synthetic subcontract counterparty",
              ivaCondition: "MONOTAX",
              roles: {
                create: [
                  { tenantId: tenant!, role: "CLIENT" },
                  { tenantId: tenant!, role: "SUBCONTRACTOR" },
                  { tenantId: tenant!, role: "SUPPLIER" },
                ],
              },
            },
          });
        }
        await tx.treasuryAccount.create({
          data: {
            id: accountId,
            tenantId,
            companyId: null,
            name: "Synthetic subcontract cash",
            type: "CASH",
            currency: "ARS",
            openingBalance: "10000",
          },
        });
      },
      { timeout: 30_000 },
    );
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    const tenants = { in: [tenantId, foreignTenantId] };
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.notification.deleteMany({ where: { tenantId: tenants } });
          await tx.emailDeliveryLog.deleteMany({ where: { tenantId: tenants } });
          await tx.journalEntryLine.deleteMany({ where: { journalEntry: { tenantId: tenants } } });
          await tx.journalEntry.deleteMany({ where: { tenantId: tenants } });
          await tx.accountMovement.deleteMany({ where: { tenantId: tenants } });
          await tx.payment.deleteMany({ where: { tenantId: tenants } });
          await tx.payableCreditApplication.deleteMany({ where: { tenantId: tenants } });
          await tx.payable.deleteMany({ where: { tenantId: tenants } });
          await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId: tenants } } });
          await tx.supplierInvoice.deleteMany({ where: { tenantId: tenants } });
          await tx.subcontractCertificationLine.deleteMany({
            where: { certification: { tenantId: tenants } },
          });
          await tx.subcontractCertification.deleteMany({ where: { tenantId: tenants } });
          await tx.subcontractLine.deleteMany({ where: { subcontract: { tenantId: tenants } } });
          await tx.subcontract.deleteMany({ where: { tenantId: tenants } });
          await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId: tenants } } });
          await tx.costItem.deleteMany({ where: { budget: { tenantId: tenants } } });
          await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
          await tx.budgetSettings.deleteMany({ where: { budget: { tenantId: tenants } } });
          await tx.budget.deleteMany({ where: { tenantId: tenants } });
          await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
          await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
          await tx.project.deleteMany({ where: { tenantId: tenants } });
          await tx.treasuryAccount.deleteMany({ where: { tenantId: tenants } });
          await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
          await tx.contact.deleteMany({ where: { tenantId: tenants } });
          await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
          await tx.companyProcurementSettings.deleteMany({
            where: { company: { tenantId: tenants } },
          });
          await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
          await tx.company.deleteMany({ where: { tenantId: tenants } });
          await tx.tenant.deleteMany({ where: { id: tenants } });
          await tx.user.deleteMany({
            where: { id: { in: [actorId, otherActorId, globalActorId, pmId] } },
          });
        },
        { timeout: 60_000 },
      );
    } finally {
      await prisma.$disconnect();
    }
  });

  async function scope(
    options: { shared?: boolean; company?: string; tenant?: string; contact?: string } = {},
  ) {
    const tenant = options.tenant ?? tenantId,
      company = options.company ?? companyId;
    const project = await prisma.project.create({
      data: {
        tenantId: tenant,
        companyId: options.shared ? null : company,
        clientContactId: options.contact ?? contactId,
        code: randomUUID(),
        name: "Synthetic subcontract project",
        country: "AR",
        status: "ACTIVE",
        type: "PRIVATE",
      },
    });
    const budget = await prisma.budget.create({
      data: {
        tenantId: tenant,
        companyId: options.shared ? null : company,
        projectId: project.id,
        name: "Synthetic subcontract baseline",
        status: "APPROVED",
        versionNumber: 1,
        currency: "ARS",
      },
    });
    const node = await prisma.wbsNode.create({
      data: {
        budgetId: budget.id,
        code: "1",
        name: "Synthetic subcontract item",
        type: "ITEM",
        costItem: {
          create: {
            budgetId: budget.id,
            unit: "m2",
            quantity: "100",
            unitSalePrice: "10",
            totalSalePrice: "1000",
            unitCostDirect: "10",
            totalCostDirect: "1000",
          },
        },
      },
    });
    clearProjectAccessModeCache();
    return { project, budget, node };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;
  function input(s: Scope, patch: Partial<CreateSubcontractInput> = {}): CreateSubcontractInput {
    return {
      companyId,
      projectId: s.project.id,
      subcontractorContactId: contactId,
      title: "Synthetic subcontract",
      contractDate: day,
      currency: "ARS",
      lines: [
        {
          wbsNodeId: s.node.id,
          description: "Synthetic item",
          unit: "m2",
          quantity: "10",
          unitPrice: "10",
        },
      ],
      ...patch,
    };
  }
  async function contract(s: Scope, patch: Partial<CreateSubcontractInput> = {}, context = ctx) {
    const result = await createSubcontract(input(s, patch), context);
    return activateSubcontract(result.id, context);
  }
  type Contract = Awaited<ReturnType<typeof contract>>;
  function certInput(
    c: Contract,
    qty = "1",
    patch: Partial<CreateSubcontractCertificationInput> = {},
  ): CreateSubcontractCertificationInput {
    return {
      subcontractId: c.id,
      periodStart: "2026-11-01",
      periodEnd: day,
      certificationDate: day,
      lines: [{ subcontractLineId: c.lines[0]!.id, currentQty: qty }],
      ...patch,
    };
  }
  const draft = (
    c: Contract,
    qty = "1",
    patch: Partial<CreateSubcontractCertificationInput> = {},
    context = ctx,
  ) => createSubcontractCertification(certInput(c, qty, patch), context);
  async function issued(c: Contract, qty = "1") {
    const d = await draft(c, qty);
    return issueSubcontractCertification(d.id, ctx);
  }
  async function approved(c: Contract, qty = "1") {
    const d = await issued(c, qty);
    return approveSubcontractCertification(d.id, ctx);
  }
  const setModule = (moduleKey: string, isEnabled: boolean) =>
    prisma.tenantModuleSetting.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      create: { tenantId, moduleKey, isEnabled },
      update: { isEnabled },
    });
  async function effects(c: Contract) {
    return {
      parent: await prisma.subcontract.findUniqueOrThrow({
        where: { id: c.id },
        select: { status: true, notes: true },
      }),
      lines: await prisma.subcontractLine.findMany({
        where: { subcontractId: c.id },
        select: { id: true, certifiedQuantity: true },
        orderBy: { id: "asc" },
      }),
      certs: await prisma.subcontractCertification.findMany({
        where: { subcontractId: c.id },
        select: { id: true, status: true },
        orderBy: { id: "asc" },
      }),
      invoices: await prisma.supplierInvoice.count({
        where: { subcontractCertification: { subcontractId: c.id } },
      }),
      audit: await prisma.auditLog.count({
        where: {
          tenantId,
          OR: [
            { entityId: c.id },
            {
              entityId: {
                in: (
                  await prisma.subcontractCertification.findMany({
                    where: { subcontractId: c.id },
                    select: { id: true },
                  })
                ).map((r) => r.id),
              },
            },
          ],
        },
      }),
    };
  }
  async function failAudit(work: () => Promise<unknown>) {
    const original = prisma.$transaction,
      transaction = original.bind(prisma);
    prisma.$transaction = (async (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: object,
    ) =>
      transaction(async (tx) => {
        const delegate = new Proxy(tx.auditLog, {
          get(target, key) {
            return key === "create"
              ? async () => {
                  throw Error("synthetic audit failure");
                }
              : Reflect.get(target, key);
          },
        });
        return fn(
          new Proxy(tx, {
            get(target, key) {
              return key === "auditLog" ? delegate : Reflect.get(target, key);
            },
          }),
        );
      }, options)) as typeof prisma.$transaction;
    try {
      await assert.rejects(work, /synthetic audit failure/);
    } finally {
      prisma.$transaction = original;
    }
  }
  async function afterPreflight<T>(work: () => Promise<T>, change: () => Promise<unknown>) {
    const original = prisma.$transaction,
      transaction = original.bind(prisma);
    let first = true;
    prisma.$transaction = (async (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: object,
    ) => {
      if (first) {
        first = false;
        await change();
      }
      return transaction(fn, options);
    }) as typeof prisma.$transaction;
    try {
      return await work();
    } finally {
      prisma.$transaction = original;
    }
  }
  async function simultaneousTransactions<T>(work: () => Promise<T>): Promise<T> {
    const original = prisma.$transaction,
      transaction = original.bind(prisma);
    let arrive = 0,
      release!: () => void;
    const rendezvous = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Bound the rendezvous if a preflight unexpectedly fails; the result still records that failure.
    const timeout = setTimeout(release, 5_000);
    prisma.$transaction = (async (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: object,
    ) => {
      if (++arrive <= 2) {
        if (arrive === 2) release();
        await rendezvous;
      }
      return transaction(fn, options);
    }) as typeof prisma.$transaction;
    try {
      return await work();
    } finally {
      clearTimeout(timeout);
      release();
      prisma.$transaction = original;
    }
  }

  it("scopes shared-project headers and certificates by company and preserves global access", async () => {
    const s = await scope({ shared: true }),
      a = await contract(s),
      b = await contract(s, { companyId: otherCompanyId }, other),
      d = await draft(a);
    assert.deepEqual(
      (await listSubcontractsByProject(s.project.id, ctx)).map((r) => r.id),
      [a.id],
    );
    assert.deepEqual(
      (await listSubcontractsByProject(s.project.id, other)).map((r) => r.id),
      [b.id],
    );
    assert.equal((await listSubcontractsByProject(s.project.id, global)).length, 2);
    await assert.rejects(() => getSubcontractById(b.id, ctx), denied);
    await assert.rejects(() => getSubcontractCertificationById(d.id, other), denied);
    await assert.rejects(() => listSubcontractCertificationsBySubcontract(a.id, other), denied);
    assert.equal((await getSubcontractCertificationById(d.id, global)).id, d.id);
  });

  it("checks membership for every ID read, picker, contract mutation and certification lifecycle method", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await draft(c),
      baseline = await effects(c);
    for (const action of [
      () => getSubcontractById(c.id, pm),
      () => listSubcontractsByProject(s.project.id, pm),
      () => getSubcontractFormWbsPickList(s.project.id, pm),
      () => listSubcontractorContacts(s.project.id, pm),
      () => getSubcontractCertificationById(d.id, pm),
      () => listSubcontractCertificationsBySubcontract(c.id, pm),
      () => updateSubcontract(c.id, { title: "hidden" }, pm),
      () => updateSubcontractMeta(c.id, { notes: "hidden" }, pm),
      () => activateSubcontract(c.id, pm),
      () => completeSubcontract(c.id, pm),
      () => cancelSubcontract(c.id, pm),
      () => draft(c, "1", {}, pm),
      () => updateSubcontractCertification(d.id, { notes: "hidden" }, pm),
      () => issueSubcontractCertification(d.id, pm),
      () => approveSubcontractCertification(d.id, pm),
      () => rejectSubcontractCertification(d.id, pm),
      () => cancelSubcontractCertification(d.id, pm),
    ])
      await assert.rejects(action, denied);
    assert.deepEqual(await effects(c), baseline);
  });

  it("denies cross-tenant roots, company injection and foreign-contact creation", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await draft(c),
      f = await scope({
        tenant: foreignTenantId,
        company: foreignCompanyId,
        contact: foreignContactId,
      });
    await assert.rejects(() => getSubcontractById(c.id, foreign), denied);
    await assert.rejects(() => getSubcontractCertificationById(d.id, foreign), denied);
    await assert.rejects(
      () => createSubcontract(input(s, { companyId: otherCompanyId }), ctx),
      denied,
    );
    await assert.rejects(
      () => createSubcontract(input(s, { subcontractorContactId: foreignContactId }), ctx),
      denied,
    );
    await assert.rejects(
      () =>
        createSubcontract(
          input(s, { lines: [{ ...input(s).lines[0]!, wbsNodeId: f.node.id }] }),
          ctx,
        ),
      denied,
    );
  });

  it("keeps shared budget WBS available while excluding another company's WBS", async () => {
    const s = await scope({ shared: true }),
      b = await prisma.budget.create({
        data: {
          tenantId,
          companyId: otherCompanyId,
          projectId: s.project.id,
          name: "Synthetic company B baseline",
          status: "APPROVED",
          versionNumber: 2,
          parentBudgetId: s.budget.id,
        },
      });
    const node = await prisma.wbsNode.create({
      data: { budgetId: b.id, code: "2", name: "Other company item", type: "ITEM" },
    });
    const picks = await getSubcontractFormWbsPickList(s.project.id, ctx);
    assert.ok(picks.wbsOptions.some((r) => r.id === s.node.id));
    assert.ok(!picks.wbsOptions.some((r) => r.id === node.id));
    await assert.rejects(
      () =>
        createSubcontract(
          input(s, { lines: [{ ...input(s).lines[0]!, wbsNodeId: node.id }] }),
          ctx,
        ),
      denied,
    );
  });

  it("refuses malformed parent graphs instead of serializing foreign names or mutating", async () => {
    const s = await scope(),
      c = await contract(s);
    await prisma.subcontract.update({
      where: { id: c.id },
      data: { subcontractorContactId: foreignContactId },
    });
    try {
      await assert.rejects(() => getSubcontractById(c.id, ctx), conflict);
      await assert.rejects(() => listSubcontractsByProject(s.project.id, ctx), conflict);
      await assert.rejects(
        () => updateSubcontractMeta(c.id, { notes: "must not persist" }, ctx),
        conflict,
      );
      assert.equal(
        (await prisma.subcontract.findUniqueOrThrow({ where: { id: c.id } })).notes,
        null,
      );
    } finally {
      await prisma.subcontract.update({
        where: { id: c.id },
        data: { subcontractorContactId: contactId },
      });
    }
  });

  it("validates certification-line ownership against its actual parent", async () => {
    const s = await scope(),
      c = await contract(s),
      second = await contract(s),
      d = await draft(c);
    await prisma.subcontractCertificationLine.update({
      where: { id: d.lines[0]!.id },
      data: { subcontractLineId: second.lines[0]!.id },
    });
    try {
      await assert.rejects(() => getSubcontractCertificationById(d.id, ctx), conflict);
      await assert.rejects(() => getSubcontractById(c.id, ctx), conflict);
      await assert.rejects(() => issueSubcontractCertification(d.id, ctx), conflict);
    } finally {
      await prisma.subcontractCertificationLine.update({
        where: { id: d.lines[0]!.id },
        data: { subcontractLineId: c.lines[0]!.id },
      });
    }
  });

  it("rejects invalid runtime inputs before writing, including duplicate certificate lines", async () => {
    const s = await scope(),
      c = await contract(s),
      baseline = await effects(c);
    for (const patch of [
      { contractDate: "2026-02-30" },
      { startDate: "2026-12-01", expectedEndDate: day },
      { lines: [] },
      { lines: [{ ...input(s).lines[0]!, quantity: "0.00001" }] },
    ])
      await assert.rejects(() => createSubcontract(input(s, patch), ctx), invalid);
    const line = certInput(c).lines[0]!;
    for (const patch of [
      { lines: [line, line] },
      { lines: [] },
      { periodStart: "2026-12-01" },
      { lines: [{ ...line, currentQty: "-1" }] },
    ])
      await assert.rejects(() => draft(c, "1", patch), invalid);
    assert.deepEqual(await effects(c), baseline);
  });

  it("stores canonical 4dp quantities/prices and rounds only the final line money", async () => {
    const s = await scope(),
      c = await contract(s, {
        currency: "USD",
        lines: [{ ...input(s).lines[0]!, quantity: "1.2345", unitPrice: "1.2550" }],
      });
    assert.equal(c.lines[0]!.quantity, "1.2345");
    assert.equal(c.lines[0]!.unitPrice, "1.2550");
    assert.equal(c.totalValue, "1.55");
    const d = await approved(c, "1.2345");
    assert.equal(d.currency, "USD");
    assert.equal(d.totalAmount, "1.55");
    const invoice = await prisma.supplierInvoice.findUniqueOrThrow({
      where: { subcontractCertificationId: d.id },
    });
    assert.equal(invoice.currency, "USD");
    assert.equal(invoice.totalAmount.toFixed(2), "1.55");
  });

  it("totals approved certificate snapshots rather than repricing combined quantities", async () => {
    const s = await scope(),
      c = await contract(s, { lines: [{ ...input(s).lines[0]!, unitPrice: "1.0050" }] });
    const a = await approved(c),
      b = await approved(c);
    assert.equal(a.totalAmount, "1.01");
    assert.equal(b.totalAmount, "1.01");
    assert.equal((await getSubcontractById(c.id, ctx)).totalCertified, "2.02");
  });

  it("supports date clearing, validates merged patches and audits draft certification edits", async () => {
    const s = await scope(),
      c = await contract(s, { startDate: "2026-11-01", expectedEndDate: day }),
      d = await draft(c);
    await assert.rejects(
      () => updateSubcontractMeta(c.id, { startDate: "2026-12-01" }, ctx),
      invalid,
    );
    const updated = await updateSubcontractMeta(
      c.id,
      { startDate: null, expectedEndDate: null },
      ctx,
    );
    assert.equal(updated.startDate, null);
    assert.equal(updated.expectedEndDate, null);
    await assert.rejects(
      () => updateSubcontractCertification(d.id, { periodStart: "2026-12-01" }, ctx),
      invalid,
    );
    await updateSubcontractCertification(d.id, { notes: "Revised synthetic note" }, ctx);
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId, entityId: d.id, action: "SUBCONTRACT_CERTIFICATION_UPDATED" },
      }),
      1,
    );
  });

  it("serializes company-wide contract numbering across distinct projects", async () => {
    const [a, b] = await Promise.all([scope(), scope()]);
    const results = await Promise.all([
      createSubcontract(input(a), ctx),
      createSubcontract(input(b), ctx),
    ]);
    assert.equal(new Set(results.map((r) => r.number)).size, 2);
  });

  it("serializes certification numbering under one parent", async () => {
    const s = await scope(),
      c = await contract(s);
    const results = await Promise.all([draft(c), draft(c)]);
    assert.equal(new Set(results.map((r) => r.number)).size, 2);
  });

  it("rechecks the remaining ceiling when sibling approvals compete", async () => {
    const s = await scope(),
      c = await contract(s),
      a = await issued(c, "6"),
      b = await issued(c, "6");
    const results = await Promise.allSettled([
      approveSubcontractCertification(a.id, ctx),
      approveSubcontractCertification(b.id, ctx),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failure = results.find((r) => r.status === "rejected");
    assert.ok(failure?.status === "rejected" && conflict(failure.reason));
    const state = await effects(c);
    assert.equal(state.lines[0]!.certifiedQuantity.toFixed(4), "6.0000");
    assert.equal(state.invoices, 1);
    assert.equal(state.certs.filter((r) => r.status === "APPROVED").length, 1);
  });

  it("refreshes previous/cumulative snapshots at approval after another certificate advances", async () => {
    const s = await scope(),
      c = await contract(s),
      a = await issued(c, "2"),
      b = await issued(c, "3");
    await approveSubcontractCertification(a.id, ctx);
    const result = await approveSubcontractCertification(b.id, ctx);
    assert.equal(result.lines[0]!.previousQty, "2.0000");
    assert.equal(result.lines[0]!.cumulativeQty, "5.0000");
    assert.equal(result.lines[0]!.remainingQty, "5.0000");
  });

  it("preserves approved quantities, invoice and audit atomicity when approval audit fails", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await issued(c, "3"),
      baseline = await effects(c);
    await failAudit(() => approveSubcontractCertification(d.id, ctx));
    assert.deepEqual(await effects(c), baseline);
  });

  it("rolls creation, metadata, draft edits and lifecycle changes back with their audit", async () => {
    const s = await scope(),
      count = await prisma.subcontract.count({ where: { projectId: s.project.id } });
    await failAudit(() => createSubcontract(input(s), ctx));
    assert.equal(await prisma.subcontract.count({ where: { projectId: s.project.id } }), count);
    const c = await contract(s),
      d = await draft(c),
      baseline = await effects(c);
    await failAudit(() => updateSubcontractMeta(c.id, { notes: "rollback" }, ctx));
    await failAudit(() => updateSubcontractCertification(d.id, { notes: "rollback" }, ctx));
    await failAudit(() => issueSubcontractCertification(d.id, ctx));
    await failAudit(() => cancelSubcontractCertification(d.id, ctx));
    assert.deepEqual(await effects(c), baseline);
    assert.equal(
      (await prisma.subcontractCertification.findUniqueOrThrow({ where: { id: d.id } })).notes,
      null,
    );
  });

  it("requires AP to approve and rechecks its module gate inside the transaction", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await issued(c),
      baseline = await effects(c);
    await setModule("AP", false);
    try {
      await assert.rejects(() => approveSubcontractCertification(d.id, ctx), denied);
    } finally {
      await setModule("AP", true);
    }
    assert.deepEqual(await effects(c), baseline);
    try {
      await assert.rejects(
        () =>
          afterPreflight(
            () => approveSubcontractCertification(d.id, ctx),
            () => setModule("AP", false),
          ),
        denied,
      );
    } finally {
      await setModule("AP", true);
    }
    assert.deepEqual(await effects(c), baseline);
  });

  it("rechecks parent activity, project status and Subcontracts gate after preflight", async () => {
    const s = await scope(),
      c = await contract(s);
    await assert.rejects(
      () =>
        afterPreflight(
          () => draft(c),
          () => prisma.subcontract.update({ where: { id: c.id }, data: { status: "COMPLETED" } }),
        ),
      conflict,
    );
    await prisma.subcontract.update({ where: { id: c.id }, data: { status: "ACTIVE" } });
    try {
      await assert.rejects(
        () =>
          afterPreflight(
            () => draft(c),
            () =>
              prisma.project.update({ where: { id: s.project.id }, data: { status: "ON_HOLD" } }),
          ),
        conflict,
      );
    } finally {
      await prisma.project.update({ where: { id: s.project.id }, data: { status: "ACTIVE" } });
    }
    try {
      await assert.rejects(
        () =>
          afterPreflight(
            () => draft(c),
            () => setModule("SUBCONTRACTS", false),
          ),
        denied,
      );
    } finally {
      await setModule("SUBCONTRACTS", true);
    }
    assert.equal(
      await prisma.subcontractCertification.count({ where: { subcontractId: c.id } }),
      0,
    );
  });

  it("rejects stale draft writes after a competing issue", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await draft(c);
    await assert.rejects(
      () =>
        afterPreflight(
          () => updateSubcontractCertification(d.id, { notes: "stale" }, ctx),
          () => issueSubcontractCertification(d.id, ctx),
        ),
      conflict,
    );
    const stored = await getSubcontractCertificationById(d.id, ctx);
    assert.equal(stored.status, "ISSUED");
    assert.equal(stored.notes, null);
  });

  it("keeps REJECTED terminal and serializes noncancelled successors", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await issued(c);
    await rejectSubcontractCertification(d.id, ctx);
    for (const action of [
      () => approveSubcontractCertification(d.id, ctx),
      () => issueSubcontractCertification(d.id, ctx),
      () => updateSubcontractCertification(d.id, { notes: "terminal" }, ctx),
      () => cancelSubcontractCertification(d.id, ctx, "terminal"),
    ])
      await assert.rejects(action, conflict);
    const results = await Promise.allSettled([
      draft(c, "1", { replacesCertificationId: d.id }),
      draft(c, "1", { replacesCertificationId: d.id }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const successor = results.find((r) => r.status === "fulfilled");
    assert.ok(successor?.status === "fulfilled");
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).successorCertificationId,
      successor.value.id,
    );
    await cancelSubcontractCertification(successor.value.id, ctx);
    const next = await draft(c, "1", { replacesCertificationId: d.id });
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).successorCertificationId,
      next.id,
    );
  });

  it("allows draft cancellation but requires reasons for issued/approved documents and replays once", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await draft(c);
    assert.equal((await cancelSubcontractCertification(d.id, ctx)).status, "CANCELLED");
    for (const state of ["ISSUED", "APPROVED"]) {
      const document = state === "ISSUED" ? await issued(c) : await approved(c);
      const before = await effects(c);
      await assert.rejects(() => cancelSubcontractCertification(document.id, ctx, "   "), invalid);
      assert.deepEqual(await effects(c), before);
      await cancelSubcontractCertification(document.id, ctx, "  Synthetic correction  ");
      const after = await effects(c);
      await cancelSubcontractCertification(document.id, ctx);
      assert.deepEqual(await effects(c), after);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId, entityId: document.id, action: "SUBCONTRACT_CERTIFICATION_CANCELLED" },
      });
      assert.equal((audit.after as { reason: string }).reason, "Synthetic correction");
    }
    assert.equal((await effects(c)).lines[0]!.certifiedQuantity.toFixed(4), "0.0000");
  });

  it("cancels approved quantity and draft invoice atomically, including audit failure", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c, "2"),
      baseline = await effects(c);
    await failAudit(() => cancelSubcontractCertification(d.id, ctx, "Synthetic correction"));
    assert.deepEqual(await effects(c), baseline);
    assert.equal(
      (
        await prisma.supplierInvoice.findUniqueOrThrow({
          where: { subcontractCertificationId: d.id },
        })
      ).status,
      "DRAFT",
    );
    const results = await Promise.all([
      cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
      cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
    ]);
    assert.ok(results.every((r) => r.status === "CANCELLED"));
    assert.equal((await effects(c)).lines[0]!.certifiedQuantity.toFixed(4), "0.0000");
    assert.equal(
      (
        await prisma.supplierInvoice.findUniqueOrThrow({
          where: { subcontractCertificationId: d.id },
        })
      ).status,
      "CANCELLED",
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId, entityId: d.id, action: "SUBCONTRACT_CERTIFICATION_CANCELLED" },
      }),
      1,
    );
  });

  it("blocks parent cancellation with approved children and permits reasonless draft cancellation replay", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c);
    await assert.rejects(() => cancelSubcontract(c.id, ctx), conflict);
    await cancelSubcontractCertification(d.id, ctx, "Synthetic correction");
    assert.equal((await cancelSubcontract(c.id, ctx)).status, "CANCELLED");
    const baseline = await effects(c);
    await cancelSubcontract(c.id, ctx);
    assert.deepEqual(await effects(c), baseline);
    const empty = await createSubcontract(input(s), ctx);
    assert.equal((await cancelSubcontract(empty.id, ctx)).status, "CANCELLED");
  });

  it("conserves the existing completion policy and allows an already-issued certificate to be approved", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await draft(c);
    await assert.rejects(() => completeSubcontract(c.id, ctx), conflict);
    await issueSubcontractCertification(d.id, ctx);
    assert.equal((await completeSubcontract(c.id, ctx)).status, "COMPLETED");
    await assert.rejects(() => draft(c), conflict);
    assert.equal((await approveSubcontractCertification(d.id, ctx)).status, "APPROVED");
  });

  it("creates only an AP draft at approval and derives settlement through issue, payments and reversals", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c, "5");
    assert.equal(d.supplierInvoiceStatus, "DRAFT");
    assert.equal(d.settlementStatus, "UNSETTLED");
    assert.equal(
      await prisma.payable.count({ where: { supplierInvoiceId: d.supplierInvoiceId! } }),
      0,
    );
    await prisma.supplierInvoice.update({
      where: { id: d.supplierInvoiceId! },
      data: { dueDate: new Date("2100-01-01") },
    });
    await issueSupplierInvoice(d.supplierInvoiceId!, ctx, s.project.id);
    const payable = await prisma.payable.findUniqueOrThrow({
      where: { supplierInvoiceId: d.supplierInvoiceId! },
    });
    await assert.rejects(
      () => cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
      conflict,
    );
    const payment = await createPayment(
      {
        payableId: payable.id,
        accountId,
        paymentDate: day,
        amount: "20",
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
      "PARTIALLY_SETTLED",
    );
    const final = await createPayment(
      {
        payableId: payable.id,
        accountId,
        paymentDate: day,
        payFullBalance: true,
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "SETTLED");
    await cancelPayment(final.id, ctx, s.project.id, "Synthetic settlement reversal");
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
      "PARTIALLY_SETTLED",
    );
    await cancelPayment(payment.id, ctx, s.project.id, "Synthetic settlement reversal");
    await cancelSupplierInvoice(d.supplierInvoiceId!, ctx, s.project.id, "Synthetic invoice reversal");
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "UNSETTLED");
    await cancelSubcontractCertification(d.id, ctx, "Synthetic correction");
    assert.equal((await effects(c)).lines[0]!.certifiedQuantity.toFixed(4), "0.0000");
  });

  it("serializes AP invoice issue against certification cancellation", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c, "2");
    const results = await Promise.allSettled([
      issueSupplierInvoice(d.supplierInvoiceId!, ctx, s.project.id),
      cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const cert = await getSubcontractCertificationById(d.id, ctx),
      invoice = await prisma.supplierInvoice.findUniqueOrThrow({
        where: { id: d.supplierInvoiceId! },
      });
    const qty = (await effects(c)).lines[0]!.certifiedQuantity.toFixed(4);
    if (cert.status === "CANCELLED") {
      assert.equal(invoice.status, "CANCELLED");
      assert.equal(qty, "0.0000");
    } else {
      assert.equal(cert.status, "APPROVED");
      assert.equal(invoice.status, "ISSUED");
      assert.equal(qty, "2.0000");
    }
  });

  it("reports unavailable settlement without querying financial rows when AP is disabled", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c);
    const original = prisma.payable.findMany;
    let queries = 0;
    prisma.payable.findMany = (async () => {
      queries++;
      throw Error("Unexpected financial query");
    }) as typeof original;
    try {
      await setModule("AP", false);
      const result = await getSubcontractCertificationById(d.id, ctx);
      assert.equal(result.settlementStatus, null);
      assert.ok(result.settlementUnavailableReason);
      assert.equal(queries, 0);
      const baseline = await effects(c);
      await assert.rejects(
        () => cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
        denied,
      );
      assert.deepEqual(await effects(c), baseline);
    } finally {
      prisma.payable.findMany = original;
      await setModule("AP", true);
    }
  });

  it("does not infer settlement from a missing/cancelled payable or a corrupted invoice root", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c);
    await prisma.supplierInvoice.update({
      where: { id: d.supplierInvoiceId! },
      data: { status: "ISSUED" },
    });
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, null);
    await prisma.supplierInvoice.update({
      where: { id: d.supplierInvoiceId! },
      data: { status: "DRAFT", companyId: otherCompanyId },
    });
    try {
      await assert.rejects(() => getSubcontractCertificationById(d.id, ctx), conflict);
      await assert.rejects(
        () => cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
        conflict,
      );
    } finally {
      await prisma.supplierInvoice.update({
        where: { id: d.supplierInvoiceId! },
        data: { companyId },
      });
    }
  });

  it("withholds AP-derived data from an assigned user without VIEW AP", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c);
    await prisma.projectMembership.create({
      data: { tenantId, projectId: s.project.id, userId: pmId },
    });
    clearProjectAccessModeCache();
    const scopedViewer: ServiceContext = { ...pm, roles: ["PROJECT_VIEWER"] };
    const original = prisma.payable.findMany;
    let queries = 0;
    prisma.payable.findMany = (async () => {
      queries++;
      throw Error("Unexpected financial query");
    }) as typeof original;
    try {
      const result = await getSubcontractCertificationById(d.id, scopedViewer);
      assert.equal(result.settlementStatus, null);
      assert.ok(result.settlementUnavailableReason);
      assert.equal(queries, 0);
      await assert.rejects(
        () => cancelSubcontractCertification(d.id, scopedViewer, "Denied write"),
        denied,
      );
    } finally {
      prisma.payable.findMany = original;
    }
  });

  it("allows an assigned PM to approve the automatic AP draft without granting AP edit", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await issued(c);
    await prisma.projectMembership.create({
      data: { tenantId, projectId: s.project.id, userId: pmId },
    });
    clearProjectAccessModeCache();
    const result = await approveSubcontractCertification(d.id, pm);
    assert.equal(result.status, "APPROVED");
    assert.equal(result.supplierInvoiceStatus, "DRAFT");
    await assert.rejects(
      () => issueSupplierInvoice(result.supplierInvoiceId!, pm, s.project.id),
      denied,
    );
  });

  it("derives partial/full credit settlement without implying a treasury payment", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c, "5");
    await prisma.supplierInvoice.update({
      where: { id: d.supplierInvoiceId! },
      data: { dueDate: new Date("2100-01-01") },
    });
    await issueSupplierInvoice(d.supplierInvoiceId!, ctx, s.project.id);
    const payable = await prisma.payable.findUniqueOrThrow({
      where: { supplierInvoiceId: d.supplierInvoiceId! },
    });
    let credited = new Prisma.Decimal(0);
    // Arrange existing D115 sources to exercise the SQL reader; this does not claim to test NC issuance.
    for (const amount of ["20", "30"]) {
      const max = await prisma.supplierInvoice.aggregate({
        where: { tenantId, companyId, documentKind: "CREDIT_NOTE" },
        _max: { number: true },
      });
      const note = await prisma.supplierInvoice.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          supplierContactId: contactId,
          number: (max._max.number ?? 0) + 1,
          documentKind: "CREDIT_NOTE",
          status: "ISSUED",
          referencedSupplierInvoiceId: d.supplierInvoiceId!,
          issueDate: new Date(day),
          dueDate: new Date(day),
          currency: "ARS",
          subtotal: amount,
          totalAmount: amount,
        },
      });
      await prisma.payableCreditApplication.create({
        data: {
          tenantId,
          companyId,
          payableId: payable.id,
          creditNoteSupplierInvoiceId: note.id,
          amount,
        },
      });
      credited = credited.plus(amount);
      await prisma.payable.update({
        where: { id: payable.id },
        data: { creditedAmount: credited, status: credited.equals("50") ? "PAID" : "PARTIAL" },
      });
      assert.equal(
        (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
        credited.equals("50") ? "SETTLED" : "PARTIALLY_SETTLED",
      );
    }
    assert.equal(await prisma.payment.count({ where: { payableId: payable.id } }), 0);
  });

  it("detects inconsistent certified counters without silently repairing historical data", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c, "2");
    await prisma.subcontractLine.update({
      where: { id: c.lines[0]!.id },
      data: { certifiedQuantity: "3" },
    });
    try {
      await assert.rejects(() => getSubcontractById(c.id, ctx), conflict);
      await assert.rejects(() => draft(c), conflict);
      await assert.rejects(
        () => cancelSubcontractCertification(d.id, ctx, "Synthetic correction"),
        conflict,
      );
      assert.equal(
        (
          await prisma.subcontractLine.findUniqueOrThrow({ where: { id: c.lines[0]!.id } })
        ).certifiedQuantity.toFixed(4),
        "3.0000",
      );
    } finally {
      await prisma.subcontractLine.update({
        where: { id: c.lines[0]!.id },
        data: { certifiedQuantity: "2" },
      });
    }
  });

  async function debitFixture() {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c, "5");
    await prisma.supplierInvoice.update({
      where: { id: d.supplierInvoiceId! },
      data: { dueDate: new Date("2100-01-01") },
    });
    await issueSupplierInvoice(d.supplierInvoiceId!, ctx, s.project.id);
    const original = await prisma.payable.findUniqueOrThrow({
      where: { supplierInvoiceId: d.supplierInvoiceId! },
    });
    await createPayment(
      {
        payableId: original.id,
        accountId,
        paymentDate: day,
        payFullBalance: true,
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    const note = await createSupplierDebitNoteFromInvoice(
      {
        parentSupplierInvoiceId: d.supplierInvoiceId!,
        dueDate: "2100-01-01",
        lines: [
          {
            description: "Synthetic debit adjustment",
            quantity: "1",
            unitPrice: "10",
            taxRate: "0",
            wbsNodeId: s.node.id,
          },
        ],
      },
      ctx,
    );
    await issueSupplierDebitNote(note.id, ctx, s.project.id);
    const debt = await prisma.payable.findUniqueOrThrow({ where: { supplierInvoiceId: note.id } });
    return { s, c, d, note, debt };
  }

  it("AG08 residual: includes issued debit-note balances, overdue priority and later payment", async () => {
    const { s, d, debt } = await debitFixture();
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
      "PARTIALLY_SETTLED",
    );
    await prisma.payable.update({
      where: { id: debt.id },
      data: { dueDate: new Date("2000-01-01") },
    });
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "OVERDUE");
    await prisma.payable.update({
      where: { id: debt.id },
      data: { dueDate: new Date("2100-01-01") },
    });
    await createPayment(
      {
        payableId: debt.id,
        accountId,
        paymentDate: day,
        amount: "5",
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
      "PARTIALLY_SETTLED",
    );
    const final = await createPayment(
      {
        payableId: debt.id,
        accountId,
        paymentDate: day,
        payFullBalance: true,
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "SETTLED");
    await cancelPayment(final.id, ctx, s.project.id, "Synthetic settlement reversal");
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
      "PARTIALLY_SETTLED",
    );
  });

  it("AG08 residual: refuses missing/cancelled or foreign debit-note obligations", async () => {
    const { s, d, note, debt } = await debitFixture();
    await prisma.payable.delete({ where: { id: debt.id } });
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, null);
    await prisma.payable.create({ data: debt });
    await prisma.payable.update({ where: { id: debt.id }, data: { status: "CANCELLED" } });
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, null);
    await prisma.payable.update({ where: { id: debt.id }, data: { status: "OPEN" } });
    const alternate = await scope();
    for (const patch of [
      { tenantId: foreignTenantId },
      { companyId: otherCompanyId },
      { projectId: alternate.project.id },
      { supplierContactId: foreignContactId },
      { currency: "USD" },
    ]) {
      await prisma.supplierInvoice.update({ where: { id: note.id }, data: patch });
      try {
        assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, null);
      } finally {
        await prisma.supplierInvoice.update({
          where: { id: note.id },
          data: {
            tenantId,
            companyId,
            projectId: s.project.id,
            supplierContactId: contactId,
            currency: "ARS",
          },
        });
      }
    }
  });

  it("AG08 residual: ignores draft/cancelled debit notes and requires every issued note to settle", async () => {
    const { s, d, note, debt } = await debitFixture();
    // Arrange lifecycle facts independently from the issuance test above; never write off the original debt.
    for (const status of ["DRAFT", "CANCELLED"] as const) {
      await prisma.supplierInvoice.update({ where: { id: note.id }, data: { status } });
      assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "SETTLED");
    }
    await prisma.supplierInvoice.update({ where: { id: note.id }, data: { status: "ISSUED" } });
    const next = await createSupplierDebitNoteFromInvoice(
      {
        parentSupplierInvoiceId: d.supplierInvoiceId!,
        dueDate: "2100-01-01",
        lines: [
          {
            description: "Second synthetic debit",
            quantity: "1",
            unitPrice: "10",
            taxRate: "0",
            wbsNodeId: s.node.id,
          },
        ],
      },
      ctx,
    );
    await issueSupplierDebitNote(next.id, ctx, s.project.id);
    await createPayment(
      {
        payableId: debt.id,
        accountId,
        paymentDate: day,
        payFullBalance: true,
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    assert.equal(
      (await getSubcontractCertificationById(d.id, ctx)).settlementStatus,
      "PARTIALLY_SETTLED",
    );
  });

  it("AG08 residual: AP gates prevent original and debit-note financial queries", async () => {
    const { s, d } = await debitFixture();
    await prisma.projectMembership.create({
      data: { tenantId, projectId: s.project.id, userId: pmId },
    });
    clearProjectAccessModeCache();
    const viewer: ServiceContext = { ...pm, roles: ["PROJECT_VIEWER"] };
    const originalPayable = prisma.payable.findMany,
      originalInvoice = prisma.supplierInvoice.findMany;
    let queries = 0;
    const forbiddenQuery = async () => {
      queries++;
      throw Error("Unexpected financial query");
    };
    prisma.payable.findMany = forbiddenQuery as typeof originalPayable;
    prisma.supplierInvoice.findMany = forbiddenQuery as typeof originalInvoice;
    try {
      assert.equal((await getSubcontractCertificationById(d.id, viewer)).settlementStatus, null);
      await setModule("AP", false);
      assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, null);
      assert.equal(queries, 0);
    } finally {
      prisma.payable.findMany = originalPayable;
      prisma.supplierInvoice.findMany = originalInvoice;
      await setModule("AP", true);
    }
  });

  it("AG08 residual: shares company invoice numbering with manual AP across projects", async () => {
    const [s, manualScope] = await Promise.all([scope(), scope()]),
      c = await contract(s),
      d = await issued(c);
    const results = await simultaneousTransactions(() =>
      Promise.allSettled([
        approveSubcontractCertification(d.id, ctx),
        createSupplierInvoice(
          createSupplierInvoiceSchema.parse({
            projectId: manualScope.project.id,
            supplierContactId: contactId,
            issueDate: day,
            dueDate: day,
            currency: "ARS",
            iibbPerceptionRate: "0",
            lines: [
              {
                description: "Synthetic manual AP",
                quantity: "1",
                unitPrice: "10",
                taxRate: "0",
                wbsNodeId: manualScope.node.id,
              },
            ],
          }),
          ctx,
        ),
      ]),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    const cert = await getSubcontractCertificationById(d.id, ctx);
    const automatic = await prisma.supplierInvoice.findUniqueOrThrow({
      where: { id: cert.supplierInvoiceId! },
    });
    const manual = results[1];
    assert.ok(manual?.status === "fulfilled");
    assert.notEqual(automatic.number, manual.value.number);
  });

  it("AG08 residual: numbers concurrent subcontract AP drafts independently from fiscal-note series", async () => {
    const [s, second] = await Promise.all([scope(), scope()]),
      c = await contract(s),
      otherContract = await contract(second),
      a = await issued(c),
      b = await issued(otherContract);
    const max = await prisma.supplierInvoice.aggregate({
      where: { tenantId, companyId, documentKind: "INVOICE" },
      _max: { number: true },
    });
    await prisma.supplierInvoice.create({
      data: {
        tenantId,
        companyId,
        projectId: s.project.id,
        supplierContactId: contactId,
        documentKind: "DEBIT_NOTE",
        number: 1_000_000,
        issueDate: new Date(day),
        dueDate: new Date(day),
        currency: "ARS",
      },
    });
    const results = await simultaneousTransactions(() =>
      Promise.allSettled([
        approveSubcontractCertification(a.id, ctx),
        approveSubcontractCertification(b.id, ctx),
      ]),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    const invoices = await prisma.supplierInvoice.findMany({
      where: { subcontractCertificationId: { in: [a.id, b.id] } },
      orderBy: { number: "asc" },
    });
    assert.deepEqual(
      invoices.map((r) => r.number),
      [(max._max.number ?? 0) + 1, (max._max.number ?? 0) + 2],
    );
  });

  it("AG08 residual: shares invoice numbering with one-step AP expenses across projects", async () => {
    const [s, expenseScope] = await Promise.all([scope(), scope()]),
      c = await contract(s),
      d = await issued(c);
    const expense = registerApExpenseSchema.parse({
      projectId: expenseScope.project.id,
      supplierContactId: contactId,
      issueDate: day,
      dueDate: day,
      currency: "ARS",
      iibbPerceptionRate: "0",
      invoiceLetter: "C",
      idempotencyKey: randomUUID(),
      lines: [
        {
          description: "Synthetic one-step AP",
          quantity: "1",
          unitPrice: "10",
          taxRate: "0",
          wbsNodeId: expenseScope.node.id,
        },
      ],
    });
    const results = await simultaneousTransactions(() =>
      Promise.allSettled([
        approveSubcontractCertification(d.id, ctx),
        registerApExpense(expense, ctx),
      ]),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    const cert = await getSubcontractCertificationById(d.id, ctx),
      automatic = await prisma.supplierInvoice.findUniqueOrThrow({
        where: { id: cert.supplierInvoiceId! },
      }),
      registered = await prisma.supplierInvoice.findFirstOrThrow({
        where: { tenantId, idempotencyKey: expense.idempotencyKey },
      });
    assert.notEqual(automatic.number, registered.number);
    assert.equal(registered.status, "ISSUED");
  });

  it("AG08 residual: validates the payment account company while retaining shared treasury accounts", async () => {
    const s = await scope(),
      c = await contract(s),
      d = await approved(c);
    await prisma.supplierInvoice.update({
      where: { id: d.supplierInvoiceId! },
      data: { dueDate: new Date("2100-01-01") },
    });
    await issueSupplierInvoice(d.supplierInvoiceId!, ctx, s.project.id);
    const payable = await prisma.payable.findUniqueOrThrow({
      where: { supplierInvoiceId: d.supplierInvoiceId! },
    });
    await createPayment(
      {
        payableId: payable.id,
        accountId,
        paymentDate: day,
        payFullBalance: true,
        idempotencyKey: randomUUID(),
        paymentMethod: "CASH",
        reference: null,
      },
      ctx,
      s.project.id,
    );
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "SETTLED");
    try {
      await prisma.treasuryAccount.update({
        where: { id: accountId },
        data: { companyId: otherCompanyId },
      });
      assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, null);
      await prisma.treasuryAccount.update({ where: { id: accountId }, data: { companyId } });
      assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "SETTLED");
    } finally {
      await prisma.treasuryAccount.update({ where: { id: accountId }, data: { companyId: null } });
    }
    assert.equal((await getSubcontractCertificationById(d.id, ctx)).settlementStatus, "SETTLED");
  });
});
