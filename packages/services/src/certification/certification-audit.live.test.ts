/** Maintained AG-08 SQL regressions. All writes follow the effective isolated-database guard. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  createCertification,
  getCertificationById,
  listCertificationsByProject,
  updateCertification,
  issueCertification,
  approveCertification,
  rejectCertification,
  cancelCertification,
} from "./certification.service";
import {
  addCertificationLine,
  updateCertificationLine,
  removeCertificationLine,
  refreshPreviousQty,
  listCertificationWbsHints,
} from "./certification-line.service";
import {
  getCertificationMeasurementSheet,
  saveCertificationMeasurement,
  listCertificationCollectionAccounts,
} from "./certification-measurement";
import { getCertificationProcurementProgress } from "./certification-procurement-progress";

const denied = (e: unknown) =>
  e instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(e.code);
const conflict = (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT";
const invalid = (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION";
const live = process.env.BLOQER_AUDIT_LIVE === "1";

describe(
  "AG-08 certification contracts on isolated SQL",
  { skip: !live, concurrency: false },
  () => {
    const tenantId = randomUUID(),
      foreignTenantId = randomUUID(),
      companyId = randomUUID(),
      otherCompanyId = randomUUID(),
      actorId = randomUUID(),
      globalActorId = randomUUID(),
      pmId = randomUUID(),
      contactId = randomUUID();
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
    const global: ServiceContext = { ...ctx, companyId: null, actorUserId: globalActorId };
    const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
    const day = new Date("2026-11-05T00:00:00Z"),
      start = "2026-11-01",
      end = "2026-11-05";
    let verified = false,
      number = 8000;
    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.createMany({
            data: [tenantId, foreignTenantId].map((id) => ({
              id,
              name: "Synthetic AG08 certifications",
              slug: `audit-certs-${id}`,
              projectAccessMode: "MEMBERSHIP_SCOPED" as const,
            })),
          });
          await tx.company.createMany({
            data: [
              { id: companyId, tenantId, name: "Synthetic cert A" },
              { id: otherCompanyId, tenantId, name: "Synthetic cert B" },
            ],
          });
          await tx.user.createMany({
            data: [actorId, globalActorId, pmId].map((id) => ({
              id,
              email: `audit-certs-${id}@example.test`,
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
              id: contactId,
              tenantId,
              legalName: "Synthetic cert counterparty",
              roles: {
                create: [
                  { tenantId, role: "CLIENT" },
                  { tenantId, role: "SUPPLIER" },
                ],
              },
            },
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
            await tx.collection.deleteMany({ where: { tenantId } });
            await tx.receivable.deleteMany({ where: { tenantId } });
            await tx.salesInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
            await tx.salesInvoice.deleteMany({ where: { tenantId } });
            await tx.certificationLine.deleteMany({ where: { certification: { tenantId } } });
            await tx.certification.deleteMany({ where: { tenantId } });
            await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { tenantId } } });
            await tx.purchaseReceipt.deleteMany({ where: { tenantId } });
            await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
            await tx.purchaseOrder.deleteMany({ where: { tenantId } });
            await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLog: { tenantId } } });
            await tx.jobsiteLog.deleteMany({ where: { tenantId } });
            await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
            await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
            await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
            await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
            await tx.budget.deleteMany({ where: { tenantId } });
            await tx.auditLog.deleteMany({ where: { tenantId } });
            await tx.projectMembership.deleteMany({ where: { tenantId } });
            await tx.project.deleteMany({ where: { tenantId } });
            await tx.treasuryAccount.deleteMany({
              where: { tenantId: { in: [tenantId, foreignTenantId] } },
            });
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
    async function scope() {
      const project = await prisma.project.create({
        data: {
          tenantId,
          companyId: null,
          clientContactId: contactId,
          code: randomUUID(),
          name: "Synthetic cert shared project",
          country: "AR",
          status: "ACTIVE",
          type: "PRIVATE",
        },
      });
      const budget = await prisma.budget.create({
        data: {
          tenantId,
          companyId: null,
          projectId: project.id,
          name: "Synthetic cert baseline",
          status: "APPROVED",
          versionNumber: 1,
          currency: "ARS",
        },
      });
      const nodes = await Promise.all(
        ["1", "2"].map((code) =>
          prisma.wbsNode.create({
            data: {
              budgetId: budget.id,
              code,
              name: "Synthetic measurable item",
              type: "ITEM",
              costItem: {
                create: {
                  budgetId: budget.id,
                  unit: "m2",
                  quantity: "100",
                  unitSalePrice: "1.2550",
                  totalSalePrice: "125.50",
                  unitCostDirect: "10",
                  totalCostDirect: "1000",
                },
              },
            },
            include: { costItem: true },
          }),
        ),
      );
      clearProjectAccessModeCache();
      return { project, budget, node: nodes[0]!, secondNode: nodes[1]! };
    }
    type Scope = Awaited<ReturnType<typeof scope>>;
    const draft = (s: Scope) =>
      createCertification(
        {
          projectId: s.project.id,
          budgetId: s.budget.id,
          periodStart: start,
          periodEnd: end,
          notes: "Initial note",
        },
        ctx,
      );
    const save = (certId: string, s: Scope, qty = "1.2500", physical = "1") =>
      saveCertificationMeasurement(
        {
          certificationId: certId,
          rows: [{ wbsNodeId: s.node.id, included: true, currentQty: qty, physicalPct: physical }],
        },
        ctx,
      );
    const invoice = (s: Scope, certId: string) =>
      prisma.salesInvoice.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          clientContactId: contactId,
          certificationId: certId,
          number: ++number,
          issueDate: day,
          dueDate: day,
          currency: "ARS",
          subtotal: 10,
          totalAmount: 10,
        },
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

    it("limits certificates by company on a shared project while preserving null/shared records and global access", async () => {
      const s = await scope(),
        own = await draft(s);
      const shared = await prisma.certification.create({
        data: {
          tenantId,
          companyId: null,
          projectId: s.project.id,
          budgetId: s.budget.id,
          number: 2,
          periodStart: day,
          periodEnd: day,
        },
      });
      const other = await prisma.certification.create({
        data: {
          tenantId,
          companyId: otherCompanyId,
          projectId: s.project.id,
          budgetId: s.budget.id,
          number: 3,
          periodStart: day,
          periodEnd: day,
        },
      });
      assert.deepEqual(
        (await listCertificationsByProject(s.project.id, ctx)).map((c) => c.id).sort(),
        [own.id, shared.id].sort(),
      );
      assert.equal((await listCertificationsByProject(s.project.id, global)).length, 3);
      for (const work of [
        () => getCertificationById(other.id, ctx),
        () => updateCertification(other.id, { notes: "must not write" }, ctx),
        () => getCertificationMeasurementSheet(other.id, ctx),
        () => listCertificationWbsHints(other.id, ctx),
        () => cancelCertification(other.id, ctx),
      ])
        await assert.rejects(work, denied);
    });
    it("rejects another company's budget and an inaccessible project before creating or exposing a certification", async () => {
      const s = await scope();
      await assert.rejects(
        () =>
          createCertification(
            { projectId: s.project.id, budgetId: s.budget.id, periodStart: start, periodEnd: end },
            pm,
          ),
        denied,
      );
      await prisma.budget.update({
        where: { id: s.budget.id },
        data: { companyId: otherCompanyId },
      });
      await assert.rejects(() => draft(s), denied);
      assert.equal(
        await prisma.certification.count({ where: { tenantId, projectId: s.project.id } }),
        0,
      );
    });
    it("rejects a legacy cross-project budget or contradictory CostItem before returning labels or issuing", async () => {
      const a = await scope(),
        b = await scope(),
        cert = await draft(a);
      await prisma.certification.update({
        where: { id: cert.id },
        data: { budgetId: b.budget.id },
      });
      await assert.rejects(() => getCertificationById(cert.id, ctx), conflict);
      await prisma.certification.update({
        where: { id: cert.id },
        data: { budgetId: a.budget.id },
      });
      await save(cert.id, a);
      await prisma.costItem.update({
        where: { id: a.node.costItem!.id },
        data: { budgetId: b.budget.id },
      });
      for (const work of [
        () => getCertificationById(cert.id, ctx),
        () => issueCertification(cert.id, ctx),
        () => getCertificationMeasurementSheet(cert.id, ctx),
      ])
        await assert.rejects(work, conflict);
    });
    it("enforces CERTIFICATIONS module gates on service reads, measurement, line and lifecycle entry points", async () => {
      const s = await scope(),
        cert = await draft(s);
      await prisma.tenantModuleSetting.create({
        data: { tenantId, moduleKey: "CERTIFICATIONS", isEnabled: false },
      });
      try {
        for (const work of [
          () => getCertificationById(cert.id, ctx),
          () => listCertificationsByProject(s.project.id, ctx),
          () => draft(s),
          () => save(cert.id, s),
          () => listCertificationWbsHints(cert.id, ctx),
          () =>
            addCertificationLine(
              { certificationId: cert.id, wbsNodeId: s.node.id, currentQty: 1, physicalPct: 1 },
              ctx,
            ),
          () => issueCertification(cert.id, ctx),
          () => approveCertification(cert.id, ctx),
          () => rejectCertification(cert.id, ctx),
          () => cancelCertification(cert.id, ctx),
          () => listCertificationCollectionAccounts(cert.id, ctx),
        ])
          await assert.rejects(work, denied);
        assert.equal(
          await prisma.certificationLine.count({ where: { certificationId: cert.id } }),
          0,
        );
      } finally {
        await prisma.tenantModuleSetting.deleteMany({
          where: { tenantId, moduleKey: "CERTIFICATIONS" },
        });
      }
    });
    it("validates direct-service dates and rejects negative or nonfinite legacy line inputs without effects", async () => {
      const s = await scope(),
        cert = await draft(s);
      await assert.rejects(
        () =>
          createCertification(
            {
              projectId: s.project.id,
              budgetId: s.budget.id,
              periodStart: "2026-02-30",
              periodEnd: end,
            },
            ctx,
          ),
        invalid,
      );
      await assert.rejects(
        () => updateCertification(cert.id, { periodEnd: "2026-11-00" }, ctx),
        invalid,
      );
      for (const currentQty of [-1, Infinity, NaN])
        await assert.rejects(
          () =>
            addCertificationLine(
              { certificationId: cert.id, wbsNodeId: s.node.id, currentQty, physicalPct: 0 },
              ctx,
            ),
          invalid,
        );
      assert.equal(
        await prisma.certificationLine.count({ where: { certificationId: cert.id } }),
        0,
      );
    });
    it("keeps sale-price snapshots and exact quantity/money scales while allowing nullable note clears", async () => {
      const s = await scope(),
        cert = await draft(s);
      const line = await addCertificationLine(
        {
          certificationId: cert.id,
          wbsNodeId: s.node.id,
          currentQty: 1.23456,
          physicalPct: 1.23456,
          notes: "line",
        },
        ctx,
      );
      await prisma.costItem.update({
        where: { id: s.node.costItem!.id },
        data: { unitSalePrice: "1000" },
      });
      await updateCertificationLine(line.id, { notes: null }, ctx);
      await updateCertification(cert.id, { notes: null, internalNotes: "" }, ctx);
      const updated = await getCertificationById(cert.id, ctx);
      assert.equal(updated.notes, null);
      assert.equal(updated.internalNotes, "");
      assert.equal(updated.lines[0]!.notes, null);
      assert.equal(updated.lines[0]!.currentQty, "1.2346");
      assert.equal(updated.lines[0]!.physicalPct, "1.2346");
      assert.equal(updated.lines[0]!.unitSalePriceSnapshot, "1.2550");
      assert.equal(updated.totalAmount, "1.55");
    });
    it("rolls back line creation and parent total when its audit fails", async () => {
      const s = await scope(),
        cert = await draft(s);
      await failAudit(() =>
        addCertificationLine(
          { certificationId: cert.id, wbsNodeId: s.node.id, currentQty: 2, physicalPct: 2 },
          ctx,
        ),
      );
      assert.equal(
        await prisma.certificationLine.count({ where: { certificationId: cert.id } }),
        0,
      );
      assert.equal(
        (
          await prisma.certification.findUniqueOrThrow({ where: { id: cert.id } })
        ).totalAmount.toString(),
        "0",
      );
    });
    for (const operation of ["update", "remove", "measurement", "refresh"] as const)
      it(`rolls ${operation} and its parent revision back when audit fails`, async () => {
        const s = await scope(),
          cert = await draft(s);
        await save(cert.id, s);
        const before = await prisma.certification.findUniqueOrThrow({
          where: { id: cert.id },
          include: { lines: true },
        });
        const lineId = before.lines[0]!.id;
        await failAudit(() =>
          operation === "update"
            ? updateCertificationLine(lineId, { currentQty: 2 }, ctx)
            : operation === "remove"
              ? removeCertificationLine(lineId, ctx)
              : operation === "measurement"
                ? save(cert.id, s, "2")
                : refreshPreviousQty(cert.id, ctx),
        );
        assert.deepEqual(
          await prisma.certification.findUniqueOrThrow({
            where: { id: cert.id },
            include: { lines: true },
          }),
          before,
        );
      });
    it("rechecks project status under its row lock for every line and worksheet mutation", async () => {
      const s = await scope(),
        cert = await draft(s);
      await save(cert.id, s);
      const before = await prisma.certification.findUniqueOrThrow({
        where: { id: cert.id },
        include: { lines: true },
      });
      for (const work of [
        () => updateCertificationLine(before.lines[0]!.id, { currentQty: 2 }, ctx),
        () => save(cert.id, s, "3"),
        () => refreshPreviousQty(cert.id, ctx),
      ]) {
        await assert.rejects(
          () =>
            afterPreflight(work, () =>
              prisma.project.update({ where: { id: s.project.id }, data: { status: "ON_HOLD" } }),
            ),
          conflict,
        );
        await prisma.project.update({ where: { id: s.project.id }, data: { status: "ACTIVE" } });
        assert.deepEqual(
          await prisma.certification.findUniqueOrThrow({
            where: { id: cert.id },
            include: { lines: true },
          }),
          before,
        );
      }
    });
    it("rechecks the approved baseline within create and issue transactions", async () => {
      const s = await scope();
      await assert.rejects(
        () =>
          afterPreflight(
            () => draft(s),
            () => prisma.budget.update({ where: { id: s.budget.id }, data: { status: "DRAFT" } }),
          ),
        conflict,
      );
      await prisma.budget.update({ where: { id: s.budget.id }, data: { status: "APPROVED" } });
      const cert = await draft(s);
      await save(cert.id, s);
      await assert.rejects(
        () =>
          afterPreflight(
            () => issueCertification(cert.id, ctx),
            () => prisma.budget.update({ where: { id: s.budget.id }, data: { status: "DRAFT" } }),
          ),
        conflict,
      );
      assert.equal(
        (await prisma.certification.findUniqueOrThrow({ where: { id: cert.id } })).status,
        "DRAFT",
      );
    });
    it("rejects stale worksheet revisions and rolls a mixed invalid save back atomically", async () => {
      const s = await scope(),
        other = await scope(),
        cert = await draft(s),
        revision = cert.updatedAt.toISOString();
      await save(cert.id, s);
      await assert.rejects(
        () =>
          saveCertificationMeasurement(
            {
              certificationId: cert.id,
              expectedRevision: revision,
              rows: [{ wbsNodeId: s.node.id, included: true, currentQty: "2", physicalPct: "2" }],
            },
            ctx,
          ),
        conflict,
      );
      const before = await getCertificationById(cert.id, ctx);
      await assert.rejects(
        () =>
          saveCertificationMeasurement(
            {
              certificationId: cert.id,
              rows: [
                { wbsNodeId: s.node.id, included: true, currentQty: "2", physicalPct: "2" },
                { wbsNodeId: other.node.id, included: true, currentQty: "1", physicalPct: "1" },
              ],
            },
            ctx,
          ),
        conflict,
      );
      assert.deepEqual(await getCertificationById(cert.id, ctx), before);
    });
    it("serializes simultaneous issues against one contractual quantity and physical ceiling", async () => {
      const s = await scope(),
        a = await draft(s),
        b = await draft(s);
      await save(a.id, s, "60", "60");
      await save(b.id, s, "60", "60");
      const result = await Promise.allSettled([
        issueCertification(a.id, ctx),
        issueCertification(b.id, ctx),
      ]);
      assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
      const active = await prisma.certification.findMany({
        where: { tenantId, projectId: s.project.id, status: "ISSUED" },
      });
      assert.equal(active.length, 1);
      assert.equal(
        (
          await prisma.certificationLine.aggregate({
            where: { certificationId: active[0]!.id },
            _sum: { currentQty: true },
          })
        )._sum.currentQty?.toString(),
        "60",
      );
    });
    it("requires a cancellation reason after issue, audits it once and preserves draft cancellation and paused replays", async () => {
      const s = await scope(),
        cert = await draft(s);
      await save(cert.id, s);
      await issueCertification(cert.id, ctx);
      await approveCertification(cert.id, ctx);
      await assert.rejects(() => cancelCertification(cert.id, ctx), invalid);
      await cancelCertification(cert.id, ctx, "Corrección operativa documentada");
      await prisma.project.update({ where: { id: s.project.id }, data: { status: "ON_HOLD" } });
      assert.equal((await cancelCertification(cert.id, ctx)).status, "CANCELLED");
      const audits = await prisma.auditLog.findMany({
        where: { tenantId, action: "certification.cancelled", entityId: cert.id },
      });
      assert.equal(audits.length, 1);
      assert.equal(
        (audits[0]!.after as { cancellationReason: string }).cancellationReason,
        "Corrección operativa documentada",
      );
      const draftScope = await scope(),
        untouched = await draft(draftScope);
      assert.equal((await cancelCertification(untouched.id, ctx)).status, "CANCELLED");
    });
    it("blocks cancellation with an active invoice before any document or audit change", async () => {
      const s = await scope(),
        cert = await draft(s);
      await save(cert.id, s);
      await issueCertification(cert.id, ctx);
      await approveCertification(cert.id, ctx);
      await invoice(s, cert.id);
      const before = await prisma.auditLog.count({ where: { tenantId, entityId: cert.id } });
      await assert.rejects(() => cancelCertification(cert.id, ctx, "Must not cancel"), conflict);
      assert.equal(
        (await prisma.certification.findUniqueOrThrow({ where: { id: cert.id } })).status,
        "APPROVED",
      );
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: cert.id } }), before);
    });
    it("never queries or invents physical progress when the jobsite source is disabled", async () => {
      const s = await scope(),
        cert = await draft(s);
      await prisma.tenantModuleSetting.createMany({
        data: ["JOBSITE_LOG", "BUDGETS"].map((moduleKey) => ({
          tenantId,
          moduleKey,
          isEnabled: false,
        })),
      });
      const original = prisma.jobsiteLogProgress.findMany;
      let calls = 0;
      prisma.jobsiteLogProgress.findMany = (() => {
        calls++;
        throw Error("must not query disabled jobsite source");
      }) as typeof original;
      try {
        const sheet = await getCertificationMeasurementSheet(cert.id, ctx);
        assert.equal(sheet.progressAvailable, false);
        assert.ok(sheet.sourceWarnings.length);
        assert.equal(sheet.rows[0]!.logQtyAcum, null);
        assert.equal(sheet.rows[0]!.suggestedQty, null);
        assert.equal(calls, 0);
      } finally {
        prisma.jobsiteLogProgress.findMany = original;
        await prisma.tenantModuleSetting.deleteMany({
          where: { tenantId, moduleKey: { in: ["JOBSITE_LOG", "BUDGETS"] } },
        });
      }
    });
    it("limits physical and procurement suggestions to the certificate company on a shared project", async () => {
      const s = await scope(),
        cert = await draft(s);
      await prisma.jobsiteLog.create({
        data: {
          tenantId,
          companyId: otherCompanyId,
          projectId: s.project.id,
          logDate: day,
          status: "APPROVED",
          progress: { create: { wbsNodeId: s.node.id, physicalPct: 90, quantityCompleted: 90 } },
        },
      });
      for (const company of [companyId, otherCompanyId])
        await prisma.purchaseOrder.create({
          data: {
            tenantId,
            companyId: company,
            projectId: s.project.id,
            supplierContactId: contactId,
            number: ++number,
            issueDate: day,
            currency: "ARS",
            status: "CONFIRMED",
            lines: {
              create: {
                wbsNodeId: s.node.id,
                description: "Synthetic scoped supply",
                unit: "un",
                quantity: 1,
                unitPrice: 100,
                lineSubtotal: 100,
                lineTotal: 100,
              },
            },
          },
        });
      const sheet = await getCertificationMeasurementSheet(cert.id, ctx);
      assert.equal(sheet.rows[0]!.suggestedQty, null);
      assert.equal(sheet.rows[0]!.logQtyAcum, "0.0000");
      assert.equal(
        sheet.rows[0]!.suggestions.find((x) => x.source === "PURCHASED")!.progressPct,
        "10.0000",
      );
    });
    it("rejects inconsistent receipt-order parents before deriving purchased or received progress", async () => {
      const s = await scope();
      const order = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          supplierContactId: contactId,
          number: ++number,
          issueDate: day,
          status: "CONFIRMED",
          lines: {
            create: {
              wbsNodeId: s.node.id,
              description: "Synthetic source",
              unit: "un",
              quantity: 2,
              unitPrice: 10,
              lineSubtotal: 20,
              lineTotal: 20,
            },
          },
        },
        include: { lines: true },
      });
      const other = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          supplierContactId: contactId,
          number: ++number,
          issueDate: day,
        },
      });
      await prisma.purchaseReceipt.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          purchaseOrderId: other.id,
          supplierContactId: contactId,
          receiptDate: day,
          status: "CONFIRMED",
          lines: { create: { purchaseOrderLineId: order.lines[0]!.id, quantityReceived: 1 } },
        },
      });
      await assert.rejects(
        () =>
          getCertificationProcurementProgress(
            {
              projectId: s.project.id,
              periodEnd: day,
              currency: "ARS",
              items: [{ id: s.node.id, budgetCost: new Prisma.Decimal(1000) }],
            },
            ctx,
          ),
        conflict,
      );
    });
    it("rejects foreign-tenant collection account names before returning a money trail", async () => {
      const s = await scope(),
        cert = await draft(s),
        inv = await invoice(s, cert.id);
      const receivable = await prisma.receivable.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          clientContactId: contactId,
          salesInvoiceId: inv.id,
          issueDate: day,
          dueDate: day,
          currency: "ARS",
          originalAmount: 10,
        },
      });
      const account = await prisma.treasuryAccount.create({
        data: {
          tenantId: foreignTenantId,
          name: "Synthetic private account",
          type: "BANK",
          currency: "ARS",
        },
      });
      await prisma.collection.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          clientContactId: contactId,
          receivableId: receivable.id,
          salesInvoiceId: inv.id,
          accountId: account.id,
          collectionDate: day,
          currency: "ARS",
          amount: 1,
          amountArs: 1,
          status: "CONFIRMED",
        },
      });
      await assert.rejects(() => listCertificationCollectionAccounts(cert.id, ctx), conflict);
    });
    it("binds global-user drafts to the budget company on shared projects without poisoning company lists", async () => {
      const s = await scope();
      await prisma.budget.update({
        where: { id: s.budget.id },
        data: { companyId: otherCompanyId },
      });
      const input = {
        projectId: s.project.id,
        budgetId: s.budget.id,
        periodStart: start,
        periodEnd: end,
      };
      const cert = await createCertification(input, global);
      assert.equal(cert.companyId, otherCompanyId);
      assert.deepEqual(await listCertificationsByProject(s.project.id, ctx), []);
      assert.deepEqual(
        (
          await listCertificationsByProject(s.project.id, {
            ...ctx,
            companyId: otherCompanyId,
            actorUserId: globalActorId,
          })
        ).map((row) => row.id),
        [cert.id],
      );
      assert.deepEqual(
        (await listCertificationsByProject(s.project.id, global)).map((row) => row.id),
        [cert.id],
      );
      await prisma.company.update({ where: { id: otherCompanyId }, data: { status: "INACTIVE" } });
      try {
        await assert.rejects(() => createCertification(input, global), denied);
        assert.equal(
          await prisma.certification.count({ where: { tenantId, projectId: s.project.id } }),
          1,
        );
      } finally {
        await prisma.company.update({ where: { id: otherCompanyId }, data: { status: "ACTIVE" } });
      }
    });
  },
);
