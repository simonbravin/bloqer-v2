/** AG-08 connections: maintained SQL tests, isolated identity guard, and owned fixture cleanup. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  getWbsSubcontractBudgetHints,
  getWbsIdsWithActiveSubcontract,
} from "../reports/budget-variance.service";
import {
  createCertification,
  issueCertification,
  approveCertification,
} from "./certification.service";
import { saveCertificationMeasurement } from "./certification-measurement";
import {
  createInvoiceFromCertification,
  createSalesInvoice,
  issueSalesInvoice,
  getActiveInvoiceForCertification,
} from "../ar/sales-invoice.service";
import {
  createSalesCreditNoteFromInvoice,
  createSalesDebitNoteFromInvoice,
  issueSalesCreditNote,
  issueSalesDebitNote,
} from "../ar/credit-debit-note.service";
import { createCollection } from "../treasury/collection.service";
import { registerArSale } from "../ar/register-ar-sale.service";
import { registerArIncome } from "../ar/register-ar-income.service";

const denied = (e: unknown) =>
  e instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(e.code);
const conflict = (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT";
const invalid = (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION";
const live = process.env.BLOQER_AUDIT_LIVE === "1";
describe(
  "AG-08 certification and subcontract connections on isolated SQL",
  { skip: !live, concurrency: false },
  () => {
    const tenantId = randomUUID(),
      foreignTenantId = randomUUID(),
      companyId = randomUUID(),
      otherCompanyId = randomUUID(),
      actorId = randomUUID(),
      globalActorId = randomUUID(),
      pmId = randomUUID(),
      clientId = randomUUID();
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
    const global: ServiceContext = { ...ctx, companyId: null, actorUserId: globalActorId };
    const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
    const date = "2026-11-05",
      day = new Date(date + "T00:00:00Z");
    let verified = false,
      sequence = 9000;
    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.createMany({
            data: [tenantId, foreignTenantId].map((id) => ({
              id,
              name: "Synthetic AG08 connection",
              slug: "audit-connection-" + id,
              projectAccessMode: "MEMBERSHIP_SCOPED" as const,
            })),
          });
          await tx.company.createMany({
            data: [
              { id: companyId, tenantId, name: "Synthetic connection A" },
              { id: otherCompanyId, tenantId, name: "Synthetic connection B" },
            ],
          });
          await tx.user.createMany({
            data: [actorId, globalActorId, pmId].map((id) => ({
              id,
              email: "audit-connection-" + id + "@example.test",
            })),
          });
          await tx.userMembership.createMany({
            data: [
              { tenantId, companyId, userId: actorId, roles: ["OWNER"] },
              { tenantId, companyId: null, userId: globalActorId, roles: ["OWNER"] },
              { tenantId, companyId, userId: pmId, roles: ["PROJECT_MANAGER"] },
            ],
          });
          await tx.contact.create({
            data: {
              id: clientId,
              tenantId,
              legalName: "Synthetic connection counterparty",
              roles: {
                create: [
                  { tenantId, role: "CLIENT" },
                  { tenantId, role: "SUBCONTRACTOR" },
                ],
              },
            },
          });
          await tx.tenantModuleSetting.create({
            data: { tenantId, moduleKey: "ACCOUNTING", isEnabled: false },
          });
        },
        { timeout: 30_000 },
      );
    });
    after(async () => {
      clearProjectAccessModeCache();
      if (!verified) return;
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.notification.deleteMany({ where: { tenantId } });
            await tx.accountMovement.deleteMany({ where: { tenantId } });
            await tx.collection.deleteMany({ where: { tenantId } });
            await tx.receivableCreditApplication.deleteMany({ where: { tenantId } });
            await tx.receivable.deleteMany({ where: { tenantId } });
            await tx.salesInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
            await tx.salesInvoice.deleteMany({ where: { tenantId } });
            await tx.certificationLine.deleteMany({ where: { certification: { tenantId } } });
            await tx.certification.deleteMany({ where: { tenantId } });
            await tx.subcontractLine.deleteMany({ where: { subcontract: { tenantId } } });
            await tx.subcontract.deleteMany({ where: { tenantId } });
            await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
            await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
            await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
            await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
            await tx.budget.deleteMany({ where: { tenantId } });
            await tx.auditLog.deleteMany({ where: { tenantId } });
            await tx.projectMembership.deleteMany({ where: { tenantId } });
            await tx.project.deleteMany({ where: { tenantId } });
            await tx.treasuryAccount.deleteMany({ where: { tenantId } });
            await tx.period.deleteMany({ where: { tenantId } });
            await tx.contactRole.deleteMany({ where: { tenantId } });
            await tx.contact.deleteMany({ where: { tenantId } });
            await tx.userMembership.deleteMany({ where: { tenantId } });
            await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
            await tx.company.deleteMany({ where: { tenantId } });
            await tx.tenant.deleteMany({ where: { id: { in: [tenantId, foreignTenantId] } } });
            await tx.user.deleteMany({ where: { id: { in: [actorId, globalActorId, pmId] } } });
          },
          { timeout: 60_000 },
        );
      } finally {
        await prisma.$disconnect();
      }
    });

    async function scope(
      options: {
        currency?: string;
        companyId?: string | null;
        price?: string;
        projectId?: string;
        parentBudgetId?: string;
        version?: number;
      } = {},
    ) {
      const project = options.projectId
        ? await prisma.project.findUniqueOrThrow({ where: { id: options.projectId } })
        : await prisma.project.create({
            data: {
              tenantId,
              companyId: null,
              clientContactId: clientId,
              name: "Synthetic connection project",
              code: randomUUID(),
              country: "AR",
              status: "ACTIVE",
            },
          });
      const budget = await prisma.budget.create({
        data: {
          tenantId,
          companyId: options.companyId ?? null,
          projectId: project.id,
          parentBudgetId: options.parentBudgetId ?? null,
          name: "Synthetic connection budget",
          versionNumber: options.version ?? 1,
          currency: options.currency ?? "ARS",
          status: "APPROVED",
        },
      });
      const node = await prisma.wbsNode.create({
        data: {
          budgetId: budget.id,
          type: "ITEM",
          code: String(options.version ?? 1),
          name: "Synthetic connection item",
          costItem: {
            create: {
              budgetId: budget.id,
              unit: "m2",
              quantity: "10",
              unitSalePrice: options.price ?? "100",
              totalSalePrice: "1000",
              unitCostDirect: "10",
              totalCostDirect: "100",
              analysisLines: {
                create: {
                  budgetId: budget.id,
                  category: "SUBCONTRACT",
                  description: "Synthetic outsourced resource",
                  unit: "m2",
                  coefficient: 1,
                  unitCost: "17.1234",
                  totalCost: "17.1234",
                },
              },
            },
          },
        },
        include: { costItem: { include: { analysisLines: true } } },
      });
      clearProjectAccessModeCache();
      return { project, budget, node };
    }
    type Scope = Awaited<ReturnType<typeof scope>>;
    async function approved(s: Scope, context: ServiceContext = ctx) {
      const cert = await createCertification(
        { projectId: s.project.id, budgetId: s.budget.id, periodStart: date, periodEnd: date },
        context,
      );
      await saveCertificationMeasurement(
        {
          certificationId: cert.id,
          rows: [{ wbsNodeId: s.node.id, included: true, currentQty: "1", physicalPct: "10" }],
        },
        context,
      );
      await issueCertification(cert.id, context);
      await approveCertification(cert.id, context);
      return cert.id;
    }
    const fromInput = (certificationId: string, currency = "ARS") => ({
      certificationId,
      issueDate: date,
      dueDate: date,
      taxRate: "0",
      iibbPerceptionRate: "0",
      invoiceLetter: "B" as const,
      ...(currency === "ARS" ? {} : { fxRate: "1000.123456" }),
    });
    async function billed(s: Scope) {
      const certId = await approved(s),
        inv = await createInvoiceFromCertification(fromInput(certId, s.budget.currency), ctx);
      await issueSalesInvoice(inv.id, ctx, s.project.id);
      return {
        certId,
        inv,
        receivable: await prisma.receivable.findUniqueOrThrow({
          where: { salesInvoiceId: inv.id },
        }),
      };
    }
    async function account(currency = "ARS") {
      return prisma.treasuryAccount.create({
        data: { tenantId, companyId, name: "Synthetic settlement account", type: "BANK", currency },
      });
    }
    async function collect(receivableId: string, projectId: string, accountId: string) {
      return createCollection(
        {
          receivableId,
          accountId,
          collectionDate: date,
          collectFullBalance: true,
          reference: null,
          idempotencyKey: randomUUID(),
        },
        ctx,
        projectId,
      );
    }
    const noteInput = (parentSalesInvoiceId: string, amount: string) => ({
      parentSalesInvoiceId,
      issueDate: date,
      dueDate: date,
      lines: [
        {
          description: "Synthetic fiscal correction",
          quantity: "1",
          unitPrice: amount,
          taxRate: "0",
          discountPct: "0",
        },
      ],
    });
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
                    throw Error("synthetic connection audit failure");
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
        await assert.rejects(work, /synthetic connection audit failure/);
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

    it("keeps company/shared/global APU hints scoped and preserves native USD reference currency", async () => {
      const shared = await scope(),
        own = await scope({
          projectId: shared.project.id,
          parentBudgetId: shared.budget.id,
          companyId,
          version: 2,
          currency: "USD",
        }),
        other = await scope({
          projectId: shared.project.id,
          parentBudgetId: shared.budget.id,
          companyId: otherCompanyId,
          version: 3,
        });
      const hints = await getWbsSubcontractBudgetHints(shared.project.id, ctx, {
        excludeWithActiveContract: false,
      });
      assert.deepEqual(hints.map((x) => x.wbsNodeId).sort(), [shared.node.id, own.node.id].sort());
      const usd = hints.find((x) => x.wbsNodeId === own.node.id)!;
      assert.equal(usd.currency, "USD");
      assert.equal(usd.budgetSubcontractTotal, "171.23");
      assert.equal(usd.unitSubcontractCost, "17.1234");
      assert.equal((await getWbsSubcontractBudgetHints(shared.project.id, global)).length, 3);
      assert.ok(!hints.some((x) => x.wbsNodeId === other.node.id));
    });
    it("never lets another company's active subcontract mask an uncovered shared item", async () => {
      const s = await scope();
      await prisma.subcontract.create({
        data: {
          tenantId,
          companyId: otherCompanyId,
          projectId: s.project.id,
          subcontractorContactId: clientId,
          number: ++sequence,
          title: "Synthetic company B coverage",
          contractDate: day,
          status: "ACTIVE",
          lines: {
            create: {
              wbsNodeId: s.node.id,
              description: "Synthetic coverage",
              unit: "m2",
              quantity: 1,
              unitPrice: 1,
              lineTotal: 1,
            },
          },
        },
      });
      assert.equal((await getWbsIdsWithActiveSubcontract(s.project.id, ctx)).size, 0);
      assert.deepEqual(
        (await getWbsSubcontractBudgetHints(s.project.id, ctx)).map((x) => x.wbsNodeId),
        [s.node.id],
      );
      assert.ok((await getWbsIdsWithActiveSubcontract(s.project.id, global)).has(s.node.id));
      assert.equal((await getWbsSubcontractBudgetHints(s.project.id, global)).length, 0);
    });
    it("checks project ACL tenant and module/role gates before subcontract hint queries", async () => {
      const s = await scope();
      await assert.rejects(() => getWbsSubcontractBudgetHints(s.project.id, pm), denied);
      await assert.rejects(
        () => getWbsIdsWithActiveSubcontract(s.project.id, { ...ctx, tenantId: foreignTenantId }),
        denied,
      );
      const wbs = prisma.wbsNode.findMany,
        lines = prisma.subcontractLine.findMany;
      let queries = 0;
      prisma.wbsNode.findMany = (() => {
        queries++;
        throw Error("must not query denied hints");
      }) as typeof wbs;
      prisma.subcontractLine.findMany = (() => {
        queries++;
        throw Error("must not query denied coverage");
      }) as typeof lines;
      try {
        await assert.rejects(
          () => getWbsSubcontractBudgetHints(s.project.id, { ...ctx, roles: [] }),
          denied,
        );
        await prisma.tenantModuleSetting.create({
          data: { tenantId, moduleKey: "SUBCONTRACTS", isEnabled: false },
        });
        for (const work of [
          () => getWbsSubcontractBudgetHints(s.project.id, ctx),
          () => getWbsIdsWithActiveSubcontract(s.project.id, ctx),
        ])
          await assert.rejects(work, denied);
        assert.equal(queries, 0);
      } finally {
        prisma.wbsNode.findMany = wbs;
        prisma.subcontractLine.findMany = lines;
        await prisma.tenantModuleSetting.deleteMany({
          where: { tenantId, moduleKey: "SUBCONTRACTS" },
        });
      }
    });
    it("rejects contradictory CostItem and APU parents instead of producing a reference amount", async () => {
      const s = await scope(),
        other = await scope();
      await prisma.costItem.update({
        where: { id: s.node.costItem!.id },
        data: { budgetId: other.budget.id },
      });
      await assert.rejects(() => getWbsSubcontractBudgetHints(s.project.id, ctx), conflict);
      await prisma.costItem.update({
        where: { id: s.node.costItem!.id },
        data: { budgetId: s.budget.id },
      });
      await prisma.costAnalysisLine.update({
        where: { id: s.node.costItem!.analysisLines[0]!.id },
        data: { budgetId: other.budget.id },
      });
      await assert.rejects(() => getWbsSubcontractBudgetHints(s.project.id, ctx), conflict);
    });
    it("refuses active coverage whose WBS belongs to another project", async () => {
      const s = await scope(),
        other = await scope();
      await prisma.subcontract.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          subcontractorContactId: clientId,
          number: ++sequence,
          title: "Synthetic invalid coverage",
          contractDate: day,
          status: "ACTIVE",
          lines: {
            create: {
              wbsNodeId: other.node.id,
              description: "Wrong project",
              unit: "m2",
              quantity: 1,
              unitPrice: 1,
              lineTotal: 1,
            },
          },
        },
      });
      await assert.rejects(() => getWbsIdsWithActiveSubcontract(s.project.id, ctx), conflict);
    });
    it("returns no invoice state and performs no source queries without AR access", async () => {
      const s = await scope(),
        certId = await approved(s),
        cert = prisma.certification.findUnique,
        invoice = prisma.salesInvoice.findFirst;
      let queries = 0;
      prisma.certification.findUnique = (() => {
        queries++;
        throw Error("must not query denied certification");
      }) as typeof cert;
      prisma.salesInvoice.findFirst = (() => {
        queries++;
        throw Error("must not query denied invoice");
      }) as typeof invoice;
      try {
        assert.equal(await getActiveInvoiceForCertification(certId, { ...ctx, roles: [] }), null);
        await prisma.tenantModuleSetting.create({
          data: { tenantId, moduleKey: "AR", isEnabled: false },
        });
        assert.equal(await getActiveInvoiceForCertification(certId, ctx), null);
        assert.equal(queries, 0);
      } finally {
        prisma.certification.findUnique = cert;
        prisma.salesInvoice.findFirst = invoice;
        await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "AR" } });
      }
    });
    it("does not mark a paid original invoice settled while an issued debit note is still open", async () => {
      const s = await scope(),
        { certId, inv, receivable } = await billed(s),
        bank = await account();
      await collect(receivable.id, s.project.id, bank.id);
      assert.equal((await getActiveInvoiceForCertification(certId, ctx))!.isSettled, true);
      const note = await createSalesDebitNoteFromInvoice(noteInput(inv.id, "10"), ctx);
      await issueSalesDebitNote(note.id, ctx, s.project.id);
      const pending = (await getActiveInvoiceForCertification(certId, ctx))!;
      assert.equal(pending.isSettled, false);
      assert.equal(pending.collectionStatusAvailable, true);
      assert.equal(pending.canCollect, false);
      const noteReceivable = await prisma.receivable.findUniqueOrThrow({
        where: { salesInvoiceId: note.id },
      });
      await collect(noteReceivable.id, s.project.id, bank.id);
      assert.equal((await getActiveInvoiceForCertification(certId, ctx))!.isSettled, true);
    });
    it("treats missing cancelled or inconsistent debit-note obligations as unavailable rather than paid", async () => {
      const s = await scope(),
        { certId, inv } = await billed(s);
      const note = await createSalesDebitNoteFromInvoice(noteInput(inv.id, "10"), ctx);
      await issueSalesDebitNote(note.id, ctx, s.project.id);
      const obligation = await prisma.receivable.findUniqueOrThrow({
        where: { salesInvoiceId: note.id },
      });
      for (const change of [
        { status: "CANCELLED" as const },
        { status: "OPEN" as const, originalAmount: new Prisma.Decimal(11) },
      ]) {
        await prisma.receivable.update({ where: { id: obligation.id }, data: change });
        const state = (await getActiveInvoiceForCertification(certId, ctx))!;
        assert.equal(state.isSettled, false);
        assert.equal(state.collectionStatusAvailable, false);
      }
      await prisma.receivable.delete({ where: { id: obligation.id } });
      assert.equal(
        (await getActiveInvoiceForCertification(certId, ctx))!.collectionStatusAvailable,
        false,
      );
    });
    it("recognizes credit-note settlement without inventing a cash collection", async () => {
      const s = await scope(),
        { certId, inv } = await billed(s);
      const note = await createSalesCreditNoteFromInvoice(noteInput(inv.id, "100"), ctx);
      await issueSalesCreditNote(note.id, ctx, s.project.id);
      const state = (await getActiveInvoiceForCertification(certId, ctx))!;
      assert.equal(state.isSettled, true);
      assert.equal(state.collectionStatusAvailable, true);
      assert.equal(
        await prisma.collection.count({ where: { tenantId, salesInvoiceId: inv.id } }),
        0,
      );
      assert.equal(
        await prisma.accountMovement.count({ where: { tenantId, projectId: s.project.id } }),
        0,
      );
    });
    it("checks invoice origin project and budget-company parents even for a global caller", async () => {
      const s = await scope(),
        other = await scope(),
        { certId, inv } = await billed(s);
      await prisma.salesInvoice.update({
        where: { id: inv.id },
        data: { projectId: other.project.id },
      });
      await assert.rejects(() => getActiveInvoiceForCertification(certId, global), conflict);
      await prisma.salesInvoice.update({
        where: { id: inv.id },
        data: { projectId: s.project.id },
      });
      await prisma.budget.update({
        where: { id: s.budget.id },
        data: { companyId: otherCompanyId },
      });
      await assert.rejects(() => getActiveInvoiceForCertification(certId, global), conflict);
      await assert.rejects(
        () => getActiveInvoiceForCertification(certId, { ...ctx, companyId: otherCompanyId }),
        denied,
      );
    });
    it("keeps budget ownership native USD and manual FX when global users bill a shared-project certificate", async () => {
      const s = await scope({ companyId: otherCompanyId, currency: "USD" }),
        certId = await approved(s, global);
      const inv = await createInvoiceFromCertification(fromInput(certId, "USD"), global);
      assert.equal(inv.companyId, otherCompanyId);
      assert.equal(inv.currency, "USD");
      assert.equal(inv.fxRate.toString(), "1000.123456");
      assert.equal(inv.totalAmount, "100.00");
      await assert.rejects(() => getActiveInvoiceForCertification(certId, ctx), denied);
      assert.equal((await getActiveInvoiceForCertification(certId, global))!.id, inv.id);
    });
    it("rereads certificate parent graphs inside billing after a changed budget preflight", async () => {
      const s = await scope(),
        certId = await approved(s);
      await assert.rejects(
        () =>
          afterPreflight(
            () => createInvoiceFromCertification(fromInput(certId), global),
            () =>
              prisma.budget.update({
                where: { id: s.budget.id },
                data: { companyId: otherCompanyId },
              }),
          ),
        conflict,
      );
      assert.equal(
        await prisma.salesInvoice.count({ where: { tenantId, certificationId: certId } }),
        0,
      );
    });
    it("shares one company invoice number allocator across different-project certification and manual creates", async () => {
      const a = await scope(),
        b = await scope(),
        c = await scope(),
        aId = await approved(a),
        bId = await approved(b);
      const before = await prisma.salesInvoice.aggregate({
        where: { tenantId, companyId, documentKind: "INVOICE" },
        _max: { number: true },
      });
      const invoices = await Promise.all([
        createInvoiceFromCertification(fromInput(aId), ctx),
        createInvoiceFromCertification(fromInput(bId), ctx),
        createSalesInvoice(
          {
            projectId: c.project.id,
            clientContactId: clientId,
            issueDate: date,
            dueDate: date,
            currency: "ARS",
            invoiceLetter: "B",
            iibbPerceptionRate: "0",
            externalInvoiceRef: null,
            lines: [
              {
                description: "Synthetic manual sale",
                quantity: "1",
                unitPrice: "10",
                taxRate: "0",
                discountPct: "0",
                sortOrder: 0,
              },
            ],
          },
          ctx,
        ),
      ]);
      const first = (before._max.number ?? 0) + 1;
      assert.deepEqual(
        invoices.map((x) => x.number).sort((x, y) => x - y),
        [first, first + 1, first + 2],
      );
    });
    it("shares certification invoice numbering with project and corporate AR registrations without collections", async () => {
      const a = await scope(),
        b = await scope(),
        certId = await approved(a);
      const sale = {
        clientContactId: clientId,
        issueDate: date,
        dueDate: date,
        currency: "ARS",
        invoiceLetter: "B" as const,
        iibbPerceptionRate: "0",
        externalInvoiceRef: null,
        lines: [
          {
            description: "Synthetic concurrent registered sale",
            quantity: "1",
            unitPrice: "10",
            taxRate: "0",
            discountPct: "0",
            sortOrder: 0,
          },
        ],
      };
      const before = await prisma.salesInvoice.aggregate({
        where: { tenantId, companyId, documentKind: "INVOICE" },
        _max: { number: true },
      });
      const [invoice, projectSale, corporateSale] = await Promise.all([
        createInvoiceFromCertification(fromInput(certId), ctx),
        registerArSale({ ...sale, projectId: b.project.id, idempotencyKey: randomUUID() }, ctx),
        registerArIncome({ ...sale, idempotencyKey: randomUUID() }, ctx),
      ]);
      const ids = [
        invoice.id,
        ...[projectSale, corporateSale].map((result) => {
          const source = result.traceChain.find((link) => link.entityType === "SalesInvoice");
          assert.ok(source);
          return source.entityId;
        }),
      ];
      const rows = await prisma.salesInvoice.findMany({
        where: { tenantId, id: { in: ids } },
        orderBy: { number: "asc" },
        select: { number: true, projectId: true, status: true, companyId: true, receivable: true },
      });
      const first = (before._max.number ?? 0) + 1;
      assert.deepEqual(
        rows.map((row) => row.number),
        [first, first + 1, first + 2],
      );
      assert.ok(rows.every((row) => row.companyId === companyId));
      assert.equal(rows.filter((row) => row.status === "ISSUED" && row.receivable).length, 2);
      assert.equal(rows.filter((row) => row.projectId === null).length, 1);
      assert.equal(
        await prisma.collection.count({ where: { tenantId, salesInvoiceId: { in: ids } } }),
        0,
      );
    });
    it("rolls certification invoice header lines and allocated number back if audit fails", async () => {
      const s = await scope(),
        certId = await approved(s),
        before = await prisma.salesInvoice.count({ where: { tenantId, projectId: s.project.id } });
      await failAudit(() => createInvoiceFromCertification(fromInput(certId), ctx));
      assert.equal(
        await prisma.salesInvoice.count({ where: { tenantId, projectId: s.project.id } }),
        before,
      );
      assert.equal(
        await prisma.salesInvoiceLine.count({
          where: { certificationLine: { certificationId: certId } },
        }),
        0,
      );
      assert.equal(
        (await prisma.certification.findUniqueOrThrow({ where: { id: certId } })).status,
        "APPROVED",
      );
    });
    it("honors the existing tax-inclusive input flag without rebuilding gross totals from rounded net prices", async () => {
      const s = await scope({ price: "121" }),
        certId = await approved(s);
      const invoice = await createInvoiceFromCertification(
        { ...fromInput(certId), taxRate: "21", pricesIncludeTax: true },
        ctx,
      );
      assert.equal(invoice.totalAmount, "121.00");
      assert.equal(invoice.subtotal, "100.00");
      assert.equal(invoice.taxAmount, "21.00");
      assert.equal(invoice.lines[0]!.unitPrice, "100.0000");
    });
    it("rejects invalid calendar input and an AR module disabled after billing preflight without partial invoices", async () => {
      const s = await scope(),
        certId = await approved(s);
      await assert.rejects(
        () => createInvoiceFromCertification({ ...fromInput(certId), dueDate: "2026-02-30" }, ctx),
        invalid,
      );
      try {
        await assert.rejects(
          () =>
            afterPreflight(
              () => createInvoiceFromCertification(fromInput(certId), ctx),
              () =>
                prisma.tenantModuleSetting.create({
                  data: { tenantId, moduleKey: "AR", isEnabled: false },
                }),
            ),
          denied,
        );
        assert.equal(
          await prisma.salesInvoice.count({ where: { tenantId, certificationId: certId } }),
          0,
        );
      } finally {
        await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "AR" } });
      }
    });
  },
);
