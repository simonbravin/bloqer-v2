/** Opt-in SQL regressions for the budget → schedule boundary. Synthetic rows only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it, type TestContext } from "node:test";
import { performance } from "node:perf_hooks";

import { prisma, type Prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { ensureScheduleForProject, importScheduleFromBudget } from "./schedule.service";

function observeImportBatches(t: TestContext) {
  const counts: Record<string, number> = {};
  const original = prisma.$transaction;
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { timeout?: number; maxWait?: number };
  const transact = original.bind(prisma) as (
    operation: Operation,
    options?: Options,
  ) => Promise<unknown>;
  (prisma as unknown as Record<string, unknown>)["$transaction"] = (
    operation: Operation,
    options?: Options,
  ) =>
    transact(
      (tx) =>
        operation(
          new Proxy(tx, {
            get(target, property) {
              const value: unknown = Reflect.get(target, property);
              if (property === "scheduleItem" || property === "scheduleItemWbsLink")
                return new Proxy(value as object, {
                  get(delegate, method) {
                    const action: unknown = Reflect.get(delegate, method);
                    if (method === "create" || method === "createMany")
                      return async (args: unknown) => {
                        const key = `${String(property)}.${String(method)}`;
                        counts[key] = (counts[key] ?? 0) + 1;
                        return (action as (input: unknown) => Promise<unknown>).call(
                          delegate,
                          args,
                        );
                      };
                    return typeof action === "function" ? action.bind(delegate) : action;
                  },
                });
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
        ),
      options,
    );
  t.after(() => {
    (prisma as unknown as Record<string, unknown>)["$transaction"] = original;
  });
  return counts;
}

describe(
  "AG-04 budget to schedule SQL atomicity",
  { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false },
  () => {
    const tenantId = randomUUID();
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const clientId = randomUUID();
    const projectId = randomUUID();
    const actorId = randomUUID();
    const budgetId = randomUUID();
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
    let verified = false;

    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.create({
            data: {
              id: tenantId,
              name: "Synthetic AG04 schedule",
              slug: `audit-ag04-schedule-${tenantId}`,
            },
          });
          await tx.company.create({
            data: { id: companyId, tenantId, name: "Synthetic AG04 company" },
          });
          await tx.company.create({
            data: { id: otherCompanyId, tenantId, name: "Synthetic AG04 other company" },
          });
          await tx.contact.create({
            data: { id: clientId, tenantId, legalName: "Synthetic AG04 client" },
          });
          await tx.user.create({
            data: { id: actorId, email: `audit-ag04-${actorId}@example.test` },
          });
          await tx.project.create({
            data: {
              id: projectId,
              tenantId,
              companyId,
              clientContactId: clientId,
              code: "AG04-SCHEDULE",
              name: "Synthetic AG04 project",
              status: "ACTIVE",
            },
          });
          await tx.budget.create({
            data: {
              id: budgetId,
              tenantId,
              companyId,
              projectId,
              versionNumber: 1,
              name: "Synthetic AG04 budget",
              status: "APPROVED",
            },
          });
          const root = await tx.wbsNode.create({
            data: { budgetId, code: "1", name: "Chapter", type: "GROUP" },
          });
          const child = await tx.wbsNode.create({
            data: { budgetId, parentId: root.id, code: "1.1", name: "Subchapter", type: "GROUP" },
          });
          await tx.wbsNode.create({
            data: { budgetId, parentId: child.id, code: "1.1.1", name: "Item", type: "ITEM" },
          });
        },
        { timeout: 30_000 },
      );
    });

    beforeEach(async () => {
      clearProjectAccessModeCache();
      await prisma.project.update({ where: { id: projectId }, data: { status: "ACTIVE" } });
      await prisma.scheduleItemWbsLink.deleteMany({ where: { tenantId } });
      await prisma.scheduleItem.deleteMany({ where: { tenantId } });
      await prisma.schedule.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
    });

    after(async () => {
      clearProjectAccessModeCache();
      try {
        if (verified)
          await prisma.$transaction(
            async (tx) => {
              await tx.scheduleItemWbsLink.deleteMany({ where: { tenantId } });
              await tx.scheduleItem.deleteMany({ where: { tenantId } });
              await tx.schedule.deleteMany({ where: { tenantId } });
              await tx.auditLog.deleteMany({ where: { tenantId } });
              await tx.wbsNode.deleteMany({ where: { budgetId } });
              await tx.budget.deleteMany({ where: { tenantId } });
              await tx.project.deleteMany({ where: { tenantId } });
              await tx.contact.deleteMany({ where: { tenantId } });
              await tx.company.deleteMany({ where: { tenantId } });
              await tx.tenant.deleteMany({ where: { id: tenantId } });
              await tx.user.deleteMany({ where: { id: actorId } });
            },
            { timeout: 30_000 },
          );
      } finally {
        await prisma.$disconnect();
      }
    });

    it("concurrent imports create one schedule and one task/link per WBS node", async () => {
      const results = await Promise.all([
        importScheduleFromBudget(projectId, { budgetId }, { ...ctx }),
        importScheduleFromBudget(projectId, { budgetId }, { ...ctx }),
      ]);
      assert.equal(results[0]!.id, results[1]!.id);
      assert.equal(await prisma.schedule.count({ where: { tenantId } }), 1);
      assert.equal(await prisma.scheduleItem.count({ where: { tenantId } }), 3);
      assert.equal(await prisma.scheduleItemWbsLink.count({ where: { tenantId } }), 3);
      assert.equal(
        await prisma.auditLog.count({
          where: { tenantId, action: "schedule.imported_from_budget" },
        }),
        1,
      );
      const schedule = await prisma.schedule.findUniqueOrThrow({ where: { projectId } });
      assert.equal(schedule.baselineBudgetId, budgetId);
    });

    it("concurrent ensure calls reuse one schedule and one creation event", async () => {
      const results = await Promise.all([
        ensureScheduleForProject(projectId, { ...ctx }),
        ensureScheduleForProject(projectId, { ...ctx }),
      ]);
      assert.equal(results[0]!.id, results[1]!.id);
      assert.equal(
        await prisma.auditLog.count({ where: { tenantId, action: "schedule.created" } }),
        1,
      );
    });

    it("a failing creation audit rolls back schedule creation", async () => {
      await assert.rejects(
        ensureScheduleForProject(projectId, { ...ctx, actorUserId: randomUUID() }),
      );
      assert.equal(await prisma.schedule.count({ where: { tenantId } }), 0);
      assert.equal(await prisma.scheduleItem.count({ where: { tenantId } }), 0);
    });

    it("a failing import audit rolls back baseline, tasks and links on an existing schedule", async () => {
      await ensureScheduleForProject(projectId, ctx);
      await assert.rejects(
        importScheduleFromBudget(projectId, { budgetId }, { ...ctx, actorUserId: randomUUID() }),
      );
      const schedule = await prisma.schedule.findUniqueOrThrow({ where: { projectId } });
      assert.equal(schedule.baselineBudgetId, null);
      assert.equal(await prisma.scheduleItem.count({ where: { tenantId } }), 0);
      assert.equal(await prisma.scheduleItemWbsLink.count({ where: { tenantId } }), 0);
      assert.equal(
        await prisma.auditLog.count({
          where: { tenantId, action: "schedule.imported_from_budget" },
        }),
        0,
      );
    });

    it("rejects a budget outside this project without creating a schedule", async () => {
      await assert.rejects(
        importScheduleFromBudget(projectId, { budgetId: randomUUID() }, ctx),
        (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND",
      );
      assert.equal(await prisma.schedule.count({ where: { tenantId } }), 0);
    });

    it("blocks import on a paused project without changing its planning", async () => {
      await prisma.project.update({ where: { id: projectId }, data: { status: "ON_HOLD" } });
      await assert.rejects(
        importScheduleFromBudget(projectId, { budgetId }, { ...ctx }),
        (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT",
      );
      assert.equal(await prisma.schedule.count({ where: { tenantId } }), 0);
    });

    it("cannot copy a company-owned budget through a shared project from another company", async () => {
      await prisma.project.update({ where: { id: projectId }, data: { companyId: null } });
      try {
        await assert.rejects(
          importScheduleFromBudget(projectId, { budgetId }, { ...ctx, companyId: otherCompanyId }),
          (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND",
        );
        assert.equal(await prisma.schedule.count({ where: { tenantId } }), 0);
      } finally {
        await prisma.project.update({ where: { id: projectId }, data: { companyId } });
      }
    });

    it("audits an empty budget baseline change without inventing imported tasks", async () => {
      const emptyBudget = await prisma.budget.create({
        data: {
          tenantId,
          companyId,
          projectId,
          versionNumber: 2,
          name: "Synthetic empty addendum",
          status: "APPROVED",
          parentBudgetId: budgetId,
        },
      });
      try {
        await importScheduleFromBudget(projectId, { budgetId: emptyBudget.id }, ctx);
        const event = await prisma.auditLog.findFirstOrThrow({
          where: { tenantId, action: "schedule.imported_from_budget" },
        });
        assert.deepEqual(event.before, { baselineBudgetId: null });
        assert.deepEqual(event.after, {
          budgetId: emptyBudget.id,
          baselineBudgetId: emptyBudget.id,
          importedCount: 0,
        });
        assert.equal(await prisma.scheduleItem.count({ where: { tenantId } }), 0);
      } finally {
        await prisma.schedule.updateMany({ where: { tenantId }, data: { baselineBudgetId: null } });
        await prisma.budget.delete({ where: { id: emptyBudget.id } });
      }
    });

    it("imports 503 tasks and their WBS links with two batch writes", async (t) => {
      const group = await prisma.wbsNode.findUniqueOrThrow({
        where: { budgetId_code: { budgetId, code: "1.1" } },
      });
      await prisma.wbsNode.createMany({
        data: Array.from({ length: 500 }, (_, index) => ({
          budgetId,
          parentId: group.id,
          code: `1.1.${index + 2}`,
          name: `Synthetic task ${index + 2}`,
          type: "ITEM" as const,
        })),
      });
      const counts = observeImportBatches(t);
      const start = performance.now();
      await importScheduleFromBudget(projectId, { budgetId }, ctx);
      t.diagnostic(
        `503-task budget import: ${Math.round(performance.now() - start)} ms; ${JSON.stringify(counts)}`,
      );
      assert.deepEqual(counts, {
        "scheduleItem.createMany": 1,
        "scheduleItemWbsLink.createMany": 1,
      });
      assert.equal(await prisma.scheduleItem.count({ where: { tenantId } }), 503);
      assert.equal(await prisma.scheduleItemWbsLink.count({ where: { tenantId } }), 503);
    });
  },
);
