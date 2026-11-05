/** SQL regressions for AG-05. Opt-in, synthetic tenant, effective DB guard and owned cleanup. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it, type TestContext } from "node:test";
import * as XLSX from "xlsx";

import { prisma, type Prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { listEmailDeliveryLogs } from "../email-delivery/email-delivery-log.service";
import {
  approveJobsiteLog,
  createJobsiteLog,
  getWbsIncrementalProgressSnapshot,
  submitJobsiteLog,
  updateJobsiteLog,
} from "../jobsite-log/jobsite-log.service";
import { confirmPurchaseReceipt } from "../procurement/purchase-receipt.service";
import {
  assertActiveJobsiteProjectsForSchedule,
  deactivateScheduledReport,
  getScheduledReportById,
  listActiveProjectsForJobsiteSchedulePicker,
  listScheduledReports,
} from "../scheduled-reports/scheduled-report.service";
import {
  countRecentFailedScheduledReportDeliveries,
  listScheduledReportEmailDeliveries,
} from "../scheduled-reports/scheduled-report-execution.service";
import {
  addScheduleDependency,
  assertScheduleEntityProject,
  createScheduleItem,
  getPrimaryScheduleItemIdsByWbs,
  getScheduleForProject,
  getScheduleItemContext,
  getScheduleLinkedWbsNodeIds,
  linkWbsNodesToScheduleItem,
  listScheduleItemAuditHistory,
  listScheduleLinkableWbsOptions,
  moveScheduleItem,
  moveScheduleItemToStatus,
  removeScheduleDependency,
  rollupScheduleContainersForProject,
  startScheduleItem,
  unlinkWbsNodeFromScheduleItem,
  updateScheduleItemDates,
  updateScheduleItemName,
  updateScheduleItemProgress,
} from "./schedule.service";
import { cleanupScheduleAuditFixture } from "./schedule-audit-fixture";
import { getProjectScheduleFieldWorkspace } from "./schedule-field-workspace.service";
import { getProjectScheduleWorkspace } from "./schedule-workspace.service";
import { buildScheduleExportPayload, exportScheduleXlsx } from "./schedule-export.service";

describe(
  "AG-05 schedule SQL integrity",
  { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false },
  () => {
    const tenantId = randomUUID();
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const actorId = randomUUID();
    const contactId = randomUUID();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const scheduleId = randomUUID();
    const otherScheduleId = randomUUID();
    const budgetId = randomUUID();
    const groupId = randomUUID();
    const wbsId = randomUUID();
    const secondWbsId = randomUUID();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const foreignParentId = randomUUID();
    const dependencyId = randomUUID();
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
    let verified = false;

    async function clearOperationalRows(tx: Prisma.TransactionClient) {
      await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLog: { tenantId } } });
      await tx.jobsiteLog.deleteMany({ where: { tenantId } });
      await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { tenantId } } });
      await tx.purchaseReceipt.deleteMany({ where: { tenantId } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
      await tx.purchaseOrder.deleteMany({ where: { tenantId } });
      await tx.scheduleItemDependency.deleteMany({ where: { tenantId } });
      await tx.scheduleItemWbsLink.deleteMany({ where: { tenantId } });
      await tx.scheduleItem.deleteMany({ where: { tenantId } });
      await tx.schedule.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
    }

    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      console.info(
        JSON.stringify({ auditFixtureTenantId: tenantId, auditFixtureActorId: actorId }),
      );
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.create({
            data: {
              id: tenantId,
              name: "Synthetic AG05 schedule",
              slug: `audit-ag05-schedule-${tenantId}`,
            },
          });
          await tx.company.createMany({
            data: [
              { id: companyId, tenantId, name: "Synthetic AG05 company" },
              { id: otherCompanyId, tenantId, name: "Synthetic AG05 other company" },
            ],
          });
          await tx.user.create({
            data: { id: actorId, email: `audit-ag05-schedule-${actorId}@example.test` },
          });
          await tx.contact.create({
            data: { id: contactId, tenantId, legalName: "Synthetic AG05 supplier/client" },
          });
          await tx.project.createMany({
            data: [
              {
                id: projectId,
                tenantId,
                companyId: null,
                clientContactId: contactId,
                code: "AG05-SCHEDULE",
                name: "Synthetic AG05 project",
                status: "ACTIVE",
              },
              {
                id: otherProjectId,
                tenantId,
                companyId,
                clientContactId: contactId,
                code: "AG05-OTHER",
                name: "Synthetic AG05 other project",
                status: "ACTIVE",
              },
            ],
          });
          await tx.budget.create({
            data: {
              id: budgetId,
              tenantId,
              companyId,
              projectId,
              versionNumber: 1,
              name: "Synthetic AG05 budget",
              status: "APPROVED",
            },
          });
          await tx.wbsNode.createMany({
            data: [
              { id: groupId, budgetId, code: "1", name: "Synthetic group", type: "GROUP" },
              {
                id: wbsId,
                budgetId,
                parentId: groupId,
                code: "1.1",
                name: "Synthetic item",
                type: "ITEM",
              },
              {
                id: secondWbsId,
                budgetId,
                parentId: groupId,
                code: "1.2",
                name: "Synthetic second item",
                type: "ITEM",
              },
            ],
          });
          await tx.costItem.create({
            data: {
              budgetId,
              wbsNodeId: wbsId,
              quantity: 100,
              unit: "m2",
              unitCostDirect: 1,
              totalCostDirect: 100,
            },
          });
        },
        { timeout: 30_000 },
      );
    });

    beforeEach(async () => {
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await clearOperationalRows(tx);
          await tx.project.updateMany({ where: { tenantId }, data: { status: "ACTIVE" } });
          await tx.project.update({ where: { id: projectId }, data: { companyId: null } });
          await tx.tenant.update({
            where: { id: tenantId },
            data: { projectAccessMode: "TENANT_WIDE" },
          });
          await tx.tenantModuleSetting.create({
            data: { tenantId, moduleKey: "INVENTORY", isEnabled: false },
          });
          await tx.schedule.createMany({
            data: [
              { id: scheduleId, projectId, tenantId, type: "HYBRID", baselineBudgetId: budgetId },
              { id: otherScheduleId, projectId: otherProjectId, tenantId, type: "HYBRID" },
            ],
          });
          await tx.scheduleItem.createMany({
            data: [
              {
                id: firstId,
                scheduleId,
                tenantId,
                name: "Synthetic first",
                sortOrder: 0,
                type: "TASK",
              },
              {
                id: secondId,
                scheduleId,
                tenantId,
                name: "Synthetic second",
                sortOrder: 1,
                type: "TASK",
              },
              {
                id: foreignParentId,
                scheduleId: otherScheduleId,
                tenantId,
                name: "Synthetic foreign parent",
                sortOrder: 0,
              },
            ],
          });
          await tx.scheduleItemWbsLink.create({
            data: { tenantId, scheduleItemId: firstId, wbsNodeId: wbsId, isPrimary: true },
          });
          await tx.scheduleItemDependency.create({
            data: { id: dependencyId, tenantId, predecessorId: firstId, successorId: secondId },
          });
        },
        { timeout: 30_000 },
      );
    });

    after(async () => {
      clearProjectAccessModeCache();
      try {
        if (verified) await cleanupScheduleAuditFixture(tenantId, actorId);
      } finally {
        await prisma.$disconnect();
      }
    });

    const isCode = (code: ServiceError["code"]) => (error: unknown) =>
      error instanceof ServiceError && error.code === code;
    async function snapshot() {
      return JSON.stringify(
        await prisma.schedule.findMany({
          where: { tenantId },
          orderBy: { id: "asc" },
          include: {
            items: {
              orderBy: { id: "asc" },
              include: {
                wbsLinks: { orderBy: { id: "asc" } },
                predecessors: { orderBy: { id: "asc" } },
              },
            },
          },
        }),
      );
    }
    async function pauseBeforeTransaction(t: TestContext, interleave?: () => Promise<void>) {
      const original = prisma.$transaction.bind(prisma);
      const stored = prisma.$transaction;
      let injected = false;
      (prisma as unknown as Record<string, unknown>)["$transaction"] = async (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options?: { timeout?: number; maxWait?: number },
      ) => {
        if (!injected) {
          injected = true;
          if (interleave) await interleave();
          else
            await prisma.project.update({ where: { id: projectId }, data: { status: "ON_HOLD" } });
        }
        return original(operation, options);
      };
      t.after(() => {
        (prisma as unknown as Record<string, unknown>)["$transaction"] = stored;
      });
    }

    it("all direct writes respect disabled schedule, including same-status requests", async () => {
      await prisma.tenantModuleSetting.create({
        data: { tenantId, moduleKey: "SCHEDULE", isEnabled: false },
      });
      const calls = [
        () => createScheduleItem(projectId, { name: "Blocked" }, { ...ctx }),
        () =>
          moveScheduleItem(projectId, { itemId: firstId, action: { kind: "down" } }, { ...ctx }),
        () => updateScheduleItemName(firstId, "Blocked", { ...ctx }),
        () =>
          updateScheduleItemDates(
            firstId,
            { startDate: "2026-11-01", endDate: "2026-11-02" },
            { ...ctx },
          ),
        () => updateScheduleItemProgress(firstId, 50, { ...ctx }),
        () => moveScheduleItemToStatus(firstId, "PLANNED", { ...ctx }),
        () => linkWbsNodesToScheduleItem(firstId, [secondWbsId], undefined, { ...ctx }),
        () => unlinkWbsNodeFromScheduleItem(firstId, wbsId, { ...ctx }),
        () => addScheduleDependency(scheduleId, secondId, firstId, { ...ctx }),
        () => removeScheduleDependency(dependencyId, { ...ctx }),
        () => rollupScheduleContainersForProject(projectId, { ...ctx }),
      ];
      const beforeState = await snapshot();
      for (const call of calls) await assert.rejects(call, isCode("FORBIDDEN"));
      assert.equal(await snapshot(), beforeState);
      assert.equal(await prisma.auditLog.count({ where: { tenantId } }), 0);
    });

    it("a reader cannot bypass EDIT with a same-status Kanban request", async () => {
      await assert.rejects(
        moveScheduleItemToStatus(firstId, "PLANNED", { ...ctx, roles: ["VIEWER"] }),
        isCode("FORBIDDEN"),
      );
    });

    it("write audit failure rolls back every mutation, including sibling ranks and links", async () => {
      const badCtx = { ...ctx, actorUserId: randomUUID() };
      const thirdId = randomUUID();
      const calls = [
        () =>
          createScheduleItem(
            projectId,
            { name: "Rolled back", afterItemId: firstId },
            { ...badCtx },
          ),
        () =>
          moveScheduleItem(projectId, { itemId: firstId, action: { kind: "down" } }, { ...badCtx }),
        () => updateScheduleItemName(firstId, "Rolled back", { ...badCtx }),
        () =>
          updateScheduleItemDates(
            firstId,
            { startDate: "2026-11-01", endDate: "2026-11-02" },
            { ...badCtx },
          ),
        () => updateScheduleItemProgress(firstId, 50, { ...badCtx }),
        () => startScheduleItem(firstId, { ...badCtx }),
        () => linkWbsNodesToScheduleItem(firstId, [secondWbsId], undefined, { ...badCtx }),
        () => unlinkWbsNodeFromScheduleItem(firstId, wbsId, { ...badCtx }),
        () => addScheduleDependency(scheduleId, firstId, thirdId, { ...badCtx }),
        () => removeScheduleDependency(dependencyId, { ...badCtx }),
        () => rollupScheduleContainersForProject(projectId, { ...badCtx }),
      ];
      // Use an independent third leaf so dependency creation genuinely writes.
      await prisma.scheduleItem.create({
        data: { id: thirdId, tenantId, scheduleId, name: "Synthetic third", sortOrder: 2 },
      });
      for (const call of calls) {
        const beforeState = await snapshot();
        await assert.rejects(call);
        assert.equal(await snapshot(), beforeState);
      }
      assert.equal(await prisma.auditLog.count({ where: { tenantId } }), 0);
    });

    it("rechecks a project paused after preflight before changing a task", async (t) => {
      await pauseBeforeTransaction(t);
      await assert.rejects(
        updateScheduleItemName(firstId, "Late write", { ...ctx }),
        isCode("CONFLICT"),
      );
      assert.equal(
        (await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })).name,
        "Synthetic first",
      );
    });

    it("permits planning in DRAFT and prevents fresh writes in final project states", async () => {
      await prisma.project.update({ where: { id: projectId }, data: { status: "DRAFT" } });
      await updateScheduleItemName(firstId, "Draft planning", { ...ctx });
      for (const status of ["ON_HOLD", "COMPLETED", "CANCELLED"] as const) {
        await prisma.project.update({ where: { id: projectId }, data: { status } });
        await assert.rejects(
          updateScheduleItemName(firstId, "Forbidden", { ...ctx }),
          isCode("CONFLICT"),
        );
      }
    });

    it("serializes inverse dependency additions so a concurrent pair cannot create a cycle", async () => {
      await prisma.scheduleItemDependency.deleteMany({ where: { tenantId } });
      const result = await Promise.allSettled([
        addScheduleDependency(scheduleId, firstId, secondId, { ...ctx }),
        addScheduleDependency(scheduleId, secondId, firstId, { ...ctx }),
      ]);
      assert.equal(result.filter((entry) => entry.status === "fulfilled").length, 1);
      assert.equal(
        result.filter((entry) => entry.status === "rejected" && isCode("VALIDATION")(entry.reason))
          .length,
        1,
      );
      assert.equal(await prisma.scheduleItemDependency.count({ where: { tenantId } }), 1);
    });

    it("reuses a duplicate dependency without a second row or audit", async () => {
      const result = await addScheduleDependency(scheduleId, firstId, secondId, { ...ctx });
      assert.equal(result.id, dependencyId);
      assert.equal(await prisma.scheduleItemDependency.count({ where: { tenantId } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { tenantId } }), 0);
    });

    it("rejects a parent or route entity from another project", async () => {
      await assert.rejects(
        moveScheduleItem(
          projectId,
          {
            itemId: firstId,
            action: { kind: "place", parentId: foreignParentId, afterItemId: null },
          },
          { ...ctx },
        ),
        isCode("VALIDATION"),
      );
      await assert.rejects(
        assertScheduleEntityProject(otherProjectId, { scheduleItemId: firstId }, { ...ctx }),
        isCode("NOT_FOUND"),
      );
      await assert.rejects(
        assertScheduleEntityProject(otherProjectId, { scheduleId }, { ...ctx }),
        isCode("NOT_FOUND"),
      );
      await assert.rejects(
        assertScheduleEntityProject(otherProjectId, { dependencyId }, { ...ctx }),
        isCode("NOT_FOUND"),
      );
      assert.equal(
        (await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })).parentId,
        null,
      );
    });

    it("does not link WBS groups or a baseline owned by another company", async () => {
      await assert.rejects(
        linkWbsNodesToScheduleItem(firstId, [groupId], undefined, { ...ctx }),
        isCode("NOT_FOUND"),
      );
      await assert.rejects(
        linkWbsNodesToScheduleItem(firstId, [wbsId], undefined, {
          ...ctx,
          companyId: otherCompanyId,
        }),
        isCode("NOT_FOUND"),
      );
      await assert.rejects(
        listScheduleLinkableWbsOptions(projectId, { ...ctx, companyId: otherCompanyId }),
        isCode("NOT_FOUND"),
      );
      assert.equal(
        await prisma.scheduleItemWbsLink.count({ where: { scheduleItemId: firstId } }),
        1,
      );
    });

    it("enforces project assignment on helpers and direct schedule reads", async () => {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { projectAccessMode: "MEMBERSHIP_SCOPED" },
      });
      clearProjectAccessModeCache();
      const restricted = { ...ctx, roles: ["PROJECT_MANAGER"] as ServiceContext["roles"] };
      await assert.rejects(
        getPrimaryScheduleItemIdsByWbs(projectId, [wbsId], { ...restricted }),
        isCode("FORBIDDEN"),
      );
      await assert.rejects(
        getScheduleLinkedWbsNodeIds(projectId, { ...restricted }),
        isCode("FORBIDDEN"),
      );
      await assert.rejects(
        getScheduleForProject(projectId, { ...restricted }),
        isCode("FORBIDDEN"),
      );
    });

    it("applies module gates to task context and history without leaking disabled sources", async () => {
      await prisma.tenantModuleSetting.createMany({
        data: [
          { tenantId, moduleKey: "JOBSITE_LOG", isEnabled: false },
          { tenantId, moduleKey: "CERTIFICATIONS", isEnabled: false },
        ],
      });
      const result = await getScheduleItemContext(projectId, firstId, { ...ctx });
      assert.deepEqual(result, {
        jobsiteEntries: [],
        certificationEntries: [],
        jobsitePhysicalPctCumulative: null,
      });
      await prisma.tenantModuleSetting.create({
        data: { tenantId, moduleKey: "SCHEDULE", isEnabled: false },
      });
      await assert.rejects(
        getScheduleItemContext(projectId, firstId, { ...ctx }),
        isCode("FORBIDDEN"),
      );
      await assert.rejects(listScheduleItemAuditHistory(firstId, { ...ctx }), isCode("FORBIDDEN"));
    });

    it("returns read-only Field and desktop workspaces on a paused project without seeding baseline", async () => {
      await prisma.project.update({ where: { id: projectId }, data: { status: "ON_HOLD" } });
      await prisma.schedule.update({ where: { id: scheduleId }, data: { baselineBudgetId: null } });
      const field = await getProjectScheduleFieldWorkspace(projectId, { ...ctx });
      const workspace = await getProjectScheduleWorkspace(projectId, {}, { ...ctx });
      assert.equal(field.canEdit, false);
      assert.equal(workspace.type, "WORKSPACE");
      if (workspace.type === "WORKSPACE") assert.equal(workspace.canEdit, false);
      assert.equal(
        (await prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } })).baselineBudgetId,
        null,
      );
      assert.equal(await prisma.auditLog.count({ where: { tenantId } }), 0);
    });

    it("allows independent desktop planning before any budget is approved", async () => {
      const workspace = await getProjectScheduleWorkspace(otherProjectId, {}, { ...ctx });
      assert.equal(workspace.type, "WORKSPACE");
      if (workspace.type !== "WORKSPACE") return;
      assert.equal(workspace.budgetId, null);
      assert.equal(workspace.budgetName, null);
      assert.equal(workspace.budgetCurrency, null);
      assert.equal(workspace.canEdit, true);
      assert.equal(workspace.items.length, 1);
      assert.equal(workspace.items[0]?.metrics, null);
      const created = await createScheduleItem(
        otherProjectId,
        { name: "Independent task" },
        { ...ctx },
      );
      assert.equal(created.scheduleId, otherScheduleId);
    });

    it("exports and reopens a real temporal XLSX without an invented currency or Gantt sheet", async () => {
      const created = await createScheduleItem(
        otherProjectId,
        {
          name: "Independent export task",
          type: "TASK",
          startDate: "2026-11-03",
          endDate: "2026-11-07",
        },
        { ...ctx },
      );
      const payload = await buildScheduleExportPayload(
        otherProjectId,
        { view: "table" },
        { ...ctx },
      );
      assert.equal(payload.budgetCurrency, null);
      assert.equal(payload.gantt, null);
      assert.equal(payload.rows.find((row) => row.id === created.id)?.budgetLabel, "—");
      const exported = await exportScheduleXlsx(otherProjectId, { view: "table" }, { ...ctx });
      assert.ok(exported.buffer.length > 500);
      const workbook = XLSX.read(exported.buffer, { type: "buffer" });
      assert.equal(workbook.SheetNames.length, 1);
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]!]!, {
        header: 1,
        raw: false,
      });
      assert.ok(
        rows.some((row) => row[0] === "Presupuesto" && row[1] === "Sin presupuesto vinculado"),
      );
      const task = rows.find((row) => row[0] === "Independent export task");
      assert.ok(task);
      assert.equal(task[4], "03/11/2026");
      assert.equal(task[5], "07/11/2026");
      assert.equal(task[11], "—");
      assert.equal(task[12], "—");
      assert.doesNotMatch(JSON.stringify(rows), /ARS|USD/);
    });

    it("ignores legacy dependencies whose counterpart belongs to another schedule", async () => {
      await prisma.scheduleItem.update({
        where: { id: foreignParentId },
        data: { startDate: new Date("2026-10-01"), endDate: new Date("2026-12-01") },
      });
      await prisma.scheduleItemDependency.createMany({
        data: [
          { tenantId, predecessorId: foreignParentId, successorId: firstId },
          { tenantId, predecessorId: firstId, successorId: foreignParentId },
        ],
      });
      const result = await updateScheduleItemDates(
        firstId,
        { startDate: "2026-11-01", endDate: "2026-11-02" },
        { ...ctx },
      );
      assert.deepEqual(result.fsWarnings, []);
    });

    it("keeps temporal planning usable with BUDGETS disabled and does not rewrite its baseline", async () => {
      await prisma.tenantModuleSetting.create({
        data: { tenantId, moduleKey: "BUDGETS", isEnabled: false },
      });
      const workspace = await getProjectScheduleWorkspace(projectId, {}, { ...ctx });
      assert.equal(workspace.type, "WORKSPACE");
      if (workspace.type !== "WORKSPACE") return;
      assert.equal(workspace.budgetId, null);
      assert.equal(workspace.budgetCurrency, null);
      assert.equal(workspace.baselineBudgetId, null);
      assert.deepEqual(workspace.availableBudgets, []);
      assert.ok(
        workspace.items.every((item) => item.metrics === null && item.wbsLinks.length === 0),
      );
      assert.equal(
        (await prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } })).baselineBudgetId,
        budgetId,
      );
      await createScheduleItem(
        projectId,
        { name: "Independent task while budgets disabled" },
        { ...ctx },
      );
    });

    it("hides financial metadata when the persisted baseline belongs to another company", async () => {
      const visibleBudget = await prisma.budget.create({
        data: {
          tenantId,
          companyId: otherCompanyId,
          projectId,
          versionNumber: 2,
          parentBudgetId: budgetId,
          name: "Synthetic other company addendum",
          status: "APPROVED",
          currency: "USD",
        },
      });
      try {
        const workspace = await getProjectScheduleWorkspace(
          projectId,
          { budgetId: visibleBudget.id },
          { ...ctx, companyId: otherCompanyId },
        );
        assert.equal(workspace.type, "WORKSPACE");
        if (workspace.type !== "WORKSPACE") return;
        assert.equal(workspace.baselineBudgetId, null);
        assert.equal(workspace.baselineBudgetMismatch, false);
        assert.equal(workspace.budgetId, null);
        assert.equal(workspace.budgetName, null);
        assert.equal(workspace.budgetCurrency, null);
        assert.ok(
          workspace.items.every((item) => item.metrics === null && item.wbsLinks.length === 0),
        );
      } finally {
        await prisma.budget.delete({ where: { id: visibleBudget.id } });
      }
    });

    it("an optional financial conflict preserves tasks, authorized links and temporal export with a warning", async (t) => {
      const delegate = prisma.budget as unknown as Record<string, unknown>;
      const original = delegate.findMany;
      t.after(() => {
        delegate.findMany = original;
      });
      for (const code of ["CONFLICT", "VALIDATION"] as const) {
        delegate.findMany = async () => {
          throw new ServiceError(code, "Synthetic optional financial failure");
        };
        const workspace = await getProjectScheduleWorkspace(projectId, {}, { ...ctx });
        assert.equal(workspace.type, "WORKSPACE");
        if (workspace.type !== "WORKSPACE") continue;
        assert.equal(workspace.budgetId, budgetId);
        assert.equal(workspace.baselineBudgetId, budgetId);
        assert.equal(workspace.budgetCurrency, "ARS");
        assert.match(workspace.metricsWarning ?? "", /Synthetic optional financial failure/);
        assert.equal(workspace.items.find((item) => item.id === firstId)?.wbsLinks.length, 1);
        assert.ok(workspace.items.every((item) => item.metrics === null));
      }
      const payload = await buildScheduleExportPayload(projectId, { view: "table" }, { ...ctx });
      assert.equal(payload.rows.find((row) => row.id === firstId)?.budgetLabel, "—");
      assert.match(payload.summaryLine, /Synthetic optional financial failure/);
      const exported = await exportScheduleXlsx(projectId, { view: "table" }, { ...ctx });
      const workbook = XLSX.read(exported.buffer, { type: "buffer" });
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]!]!, {
        header: 1,
        raw: false,
      });
      assert.ok(
        rows.some(
          (row) => row[0] === "Resumen" && row[1]?.includes("Synthetic optional financial failure"),
        ),
      );
      const task = rows.find((row) => row[0] === "Synthetic first");
      assert.equal(task?.[11], "—");
      assert.equal(task?.[12], "—");
    });

    it("does not swallow authorization or unexpected financial read failures", async (t) => {
      const delegate = prisma.budget as unknown as Record<string, unknown>;
      const original = delegate.findMany;
      t.after(() => {
        delegate.findMany = original;
      });
      for (const error of [
        new ServiceError("FORBIDDEN", "Synthetic financial permission rejection"),
        new Error("Synthetic unexpected failure"),
      ]) {
        delegate.findMany = async () => {
          throw error;
        };
        await assert.rejects(
          getProjectScheduleWorkspace(projectId, {}, { ...ctx }),
          (actual) => actual === error,
        );
      }
    });

    it("moves a 503-sibling schedule with one batch update and keeps all ranks", async (t) => {
      await prisma.scheduleItem.createMany({
        data: Array.from({ length: 501 }, (_, index) => ({
          tenantId,
          scheduleId,
          name: `Synthetic ${index}`,
          sortOrder: index + 2,
        })),
      });
      const start = Date.now();
      await moveScheduleItem(projectId, { itemId: firstId, action: { kind: "down" } }, { ...ctx });
      t.diagnostic(`503-sibling move ${Date.now() - start} ms`);
      const rows = await prisma.scheduleItem.findMany({
        where: { scheduleId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true },
      });
      assert.equal(rows.length, 503);
      assert.deepEqual(
        rows.map((row) => row.sortOrder),
        Array.from({ length: 503 }, (_, index) => index),
      );
      assert.equal(rows[0]?.id, secondId);
      assert.equal(rows[1]?.id, firstId);
    });

    async function submittedLog(
      physicalPct: number,
      sourceCompanyId = companyId,
      progressWbsId = wbsId,
    ) {
      return prisma.jobsiteLog.create({
        data: {
          tenantId,
          companyId: sourceCompanyId,
          projectId,
          logDate: new Date("2026-11-01"),
          generalNotes: "Synthetic AG05 progress",
          status: "SUBMITTED",
          createdBy: actorId,
          progress: { create: { wbsNodeId: progressWbsId, quantityCompleted: 0, physicalPct } },
        },
      });
    }

    it("preserves the global Real of a shared WBS regardless of the approving company order", async () => {
      await prisma.budget.update({ where: { id: budgetId }, data: { companyId: null } });
      try {
        await prisma.scheduleItemWbsLink.create({
          data: { tenantId, scheduleItemId: secondId, wbsNodeId: secondWbsId, isPrimary: true },
        });
        for (const [targetItemId, progressWbsId, companyOrder] of [
          [firstId, wbsId, [companyId, otherCompanyId]],
          [secondId, secondWbsId, [otherCompanyId, companyId]],
        ] as const) {
          for (const sourceCompanyId of companyOrder) {
            const log = await submittedLog(
              sourceCompanyId === companyId ? 25 : 30,
              sourceCompanyId,
              progressWbsId,
            );
            await approveJobsiteLog(log.id, { ...ctx, companyId: sourceCompanyId });
          }
          assert.equal(
            (
              await prisma.scheduleItem.findUniqueOrThrow({ where: { id: targetItemId } })
            ).progressPct.toString(),
            "55",
          );
        }
      } finally {
        await prisma.budget.update({ where: { id: budgetId }, data: { companyId } });
      }
    });

    it("AG-11 enforces the exact four-decimal progress cap across companies on a shared WBS", async () => {
      await prisma.budget.update({ where: { id: budgetId }, data: { companyId: null } });
      try {
        const otherCtx = { ...ctx, companyId: otherCompanyId };
        const baseline = await submittedLog(99.9951);
        await approveJobsiteLog(baseline.id, ctx);
        const ownSnapshot = await getWbsIncrementalProgressSnapshot(projectId, ctx);
        assert.equal(ownSnapshot[wbsId]?.exactApprovedIncrementalPct, "99.9951");
        const otherSnapshot = await getWbsIncrementalProgressSnapshot(projectId, otherCtx);
        assert.equal(otherSnapshot[wbsId], undefined);

        const createRemainder = (physicalPct: string) =>
          createJobsiteLog({
            projectId,
            idempotencyKey: randomUUID(),
            logDate: "2026-11-01",
            progress: [{ wbsNodeId: wbsId, quantityCompleted: "0", physicalPct }],
            labor: [],
            materials: [],
            issues: [],
          }, otherCtx);

        await assert.rejects(createRemainder("0.0050"), (err) =>
          isCode("CONFLICT")(err) && err instanceof Error &&
          err.message.includes("no puede superar 100%") && !err.message.includes("99.9951"),
        );
        const remainder = await createRemainder("0.0049");
        await submitJobsiteLog(remainder.id, otherCtx);
        await approveJobsiteLog(remainder.id, otherCtx);
        const aggregate = await prisma.jobsiteLogProgress.aggregate({
          where: { wbsNodeId: wbsId, jobsiteLog: { tenantId, status: "APPROVED" } },
          _sum: { physicalPct: true },
        });
        assert.equal(aggregate._sum.physicalPct?.toString(), "100");
      } finally {
        await prisma.budget.update({ where: { id: budgetId }, data: { companyId } });
      }
    });

    it("AG-11 scopes daily report setup and stored report actions to authorized companies and projects", async () => {
      const ids = {
        shared: randomUUID(),
        foreign: randomUUID(),
        foreignProject: randomUUID(),
        sharedForeignSelection: randomUUID(),
      };
      await prisma.project.update({ where: { id: otherProjectId }, data: { companyId: otherCompanyId } });
      try {
        const base = {
          tenantId,
          frequency: "DAILY",
          timeOfDay: "20:00",
          timezone: "America/Argentina/Buenos_Aires",
          format: "PDF",
          nextRunAt: new Date("2030-01-01"),
          createdByUserId: actorId,
        } as const;
        await prisma.scheduledReport.createMany({
          data: [
            { ...base, id: ids.shared, companyId: null, scope: "TENANT", name: "Synthetic shared daily report" },
            { ...base, id: ids.foreign, companyId: otherCompanyId, scope: "TENANT", name: "Synthetic foreign daily report" },
            {
              ...base,
              id: ids.foreignProject,
              companyId: null,
              projectId: otherProjectId,
              scope: "PROJECT",
              name: "Synthetic foreign project report",
            },
            {
              ...base,
              id: ids.sharedForeignSelection,
              companyId: null,
              scope: "TENANT",
              name: "Synthetic shared daily report of foreign project",
              params: { jobsiteProjectIds: otherProjectId },
            },
          ],
        });
        await prisma.scheduledReportItem.create({
          data: {
            tenantId,
            scheduledReportId: ids.sharedForeignSelection,
            reportKey: "TENANT_JOBSITE_DAILY_LOGS",
          },
        });
        await prisma.userMembership.create({ data: { tenantId, companyId, userId: actorId, roles: ["OWNER"] } });
        const delivery = {
          tenantId,
          subject: "Synthetic daily report",
          emailType: "REPORT_SCHEDULED",
          status: "FAILED",
          provider: "DISABLED",
          relatedEntityType: "SCHEDULED_REPORT",
          relatedEntityId: ids.shared,
        } as const;
        await prisma.emailDeliveryLog.createMany({
          data: [
            { ...delivery, companyId, recipientUserId: actorId, recipientEmail: "own@example.test" },
            { ...delivery, companyId: null, recipientUserId: actorId, recipientEmail: "shared-verified@example.test" },
            { ...delivery, companyId: null, recipientEmail: "shared-unknown@example.test" },
            { ...delivery, companyId: otherCompanyId, recipientUserId: actorId, recipientEmail: "foreign@example.test" },
            { ...delivery, companyId, relatedEntityId: ids.sharedForeignSelection, recipientEmail: "foreign-project@example.test" },
          ],
        });

        assert.deepEqual((await listActiveProjectsForJobsiteSchedulePicker(ctx)).map(({ id }) => id), [projectId]);
        const items = [{ reportKey: "TENANT_JOBSITE_DAILY_LOGS" }];
        await assertActiveJobsiteProjectsForSchedule(items, { jobsiteProjectIds: projectId }, ctx);
        await assert.rejects(
          assertActiveJobsiteProjectsForSchedule(items, { jobsiteProjectIds: otherProjectId }, ctx),
          isCode("VALIDATION"),
        );
        assert.deepEqual((await listScheduledReports(ctx)).map(({ id }) => id), [ids.shared]);
        await assert.rejects(getScheduledReportById(ctx, ids.foreignProject), isCode("NOT_FOUND"));
        await assert.rejects(getScheduledReportById(ctx, ids.sharedForeignSelection), isCode("NOT_FOUND"));
        assert.deepEqual(await listScheduledReportEmailDeliveries(ctx, ids.sharedForeignSelection), []);
        assert.deepEqual(await listEmailDeliveryLogs({
          relatedEntityType: "SCHEDULED_REPORT",
          relatedEntityId: ids.sharedForeignSelection,
        }, ctx), []);
        const visibleEmails = ["own@example.test", "shared-verified@example.test"];
        assert.deepEqual(
          (await listScheduledReportEmailDeliveries(ctx, ids.shared)).map((row) => row.recipientEmail).sort(),
          visibleEmails,
        );
        assert.deepEqual(
          (await listEmailDeliveryLogs({ relatedEntityType: "SCHEDULED_REPORT", relatedEntityId: ids.shared }, ctx))
            .map((row) => row.recipientEmail).sort(),
          visibleEmails,
        );
        assert.equal(await countRecentFailedScheduledReportDeliveries(ctx, ids.shared), 2);
        await assert.rejects(deactivateScheduledReport(ctx, ids.shared), isCode("NOT_FOUND"));
        await assert.rejects(deactivateScheduledReport(ctx, ids.foreign), isCode("NOT_FOUND"));
        assert.equal((await getScheduledReportById({ ...ctx, companyId: otherCompanyId }, ids.foreign)).status, "ACTIVE");
        const tenantCtx = { ...ctx, companyId: null };
        assert.equal((await listScheduledReportEmailDeliveries(tenantCtx, ids.shared)).length, 4);
        assert.equal((await getScheduledReportById(tenantCtx, ids.sharedForeignSelection)).status, "ACTIVE");
        await deactivateScheduledReport(tenantCtx, ids.shared);
        assert.equal((await getScheduledReportById(ctx, ids.shared)).status, "PAUSED");
      } finally {
        await prisma.emailDeliveryLog.deleteMany({ where: { tenantId, relatedEntityId: { in: Object.values(ids) } } });
        await prisma.userMembership.deleteMany({ where: { tenantId, userId: actorId } });
        await prisma.scheduledReportItem.deleteMany({ where: { tenantId, scheduledReportId: { in: Object.values(ids) } } });
        await prisma.scheduledReport.deleteMany({ where: { tenantId, id: { in: Object.values(ids) } } });
        await prisma.project.update({ where: { id: otherProjectId }, data: { companyId } });
      }
    });

    it("approval synchronizes TASK progress atomically and leaves MILESTONE unchanged", async () => {
      const milestone = await createScheduleItem(
        projectId,
        { name: "Synthetic arrival", type: "MILESTONE", wbsNodeId: wbsId },
        { ...ctx },
      );
      const log = await submittedLog(25);
      await approveJobsiteLog(log.id, { ...ctx });
      const task = await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } });
      assert.equal(task.progressPct.toString(), "25");
      assert.equal(task.status, "IN_PROGRESS");
      assert.equal(
        (await prisma.scheduleItem.findUniqueOrThrow({ where: { id: milestone.id } })).status,
        "PLANNED",
      );
      assert.equal(
        await prisma.auditLog.count({ where: { tenantId, action: "JOBSITE_LOG_APPROVED" } }),
        1,
      );
    });

    it("a precached draft edit cannot replace progress after submit and approval synchronize the schedule", async (t) => {
      const log = await submittedLog(25);
      await prisma.jobsiteLog.update({ where: { id: log.id }, data: { status: "DRAFT" } });
      await pauseBeforeTransaction(t, async () => {
        await submitJobsiteLog(log.id, { ...ctx });
        await approveJobsiteLog(log.id, { ...ctx });
      });
      await assert.rejects(
        updateJobsiteLog(
          log.id,
          {
            progress: [{ wbsNodeId: wbsId, quantityCompleted: "0", physicalPct: "10" }],
            labor: [],
            materials: [],
            issues: [],
          },
          { ...ctx },
        ),
        isCode("CONFLICT"),
      );
      assert.equal(
        (await prisma.jobsiteLog.findUniqueOrThrow({ where: { id: log.id } })).status,
        "APPROVED",
      );
      assert.equal(
        (
          await prisma.jobsiteLogProgress.findFirstOrThrow({ where: { jobsiteLogId: log.id } })
        ).physicalPct?.toString(),
        "25",
      );
      assert.equal(
        (
          await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })
        ).progressPct.toString(),
        "25",
      );
    });

    it("concurrent submissions recheck the physical cap under the project lock", async () => {
      const first = await submittedLog(60);
      const second = await submittedLog(60);
      await prisma.jobsiteLog.updateMany({
        where: { id: { in: [first.id, second.id] } },
        data: { status: "DRAFT" },
      });
      const result = await Promise.allSettled([
        submitJobsiteLog(first.id, { ...ctx }),
        submitJobsiteLog(second.id, { ...ctx }),
      ]);
      assert.equal(result.filter((entry) => entry.status === "fulfilled").length, 1);
      assert.equal(
        result.filter((entry) => entry.status === "rejected" && isCode("CONFLICT")(entry.reason))
          .length,
        1,
      );
      assert.equal(await prisma.jobsiteLog.count({ where: { tenantId, status: "SUBMITTED" } }), 1);
      assert.equal(
        (
          await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })
        ).progressPct.toString(),
        "0",
      );
    });

    it("an explicit approved zero resets a manual exception instead of ignoring the measurement", async () => {
      await updateScheduleItemProgress(firstId, 40, { ...ctx });
      const log = await submittedLog(0);
      await approveJobsiteLog(log.id, { ...ctx });
      assert.equal(
        (
          await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })
        ).progressPct.toString(),
        "0",
      );
    });

    it("approval audit failure rolls back both the log and schedule sync", async () => {
      const log = await submittedLog(25);
      await assert.rejects(approveJobsiteLog(log.id, { ...ctx, actorUserId: randomUUID() }));
      assert.equal(
        (await prisma.jobsiteLog.findUniqueOrThrow({ where: { id: log.id } })).status,
        "SUBMITTED",
      );
      assert.equal(
        (
          await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })
        ).progressPct.toString(),
        "0",
      );
      assert.equal(await prisma.auditLog.count({ where: { tenantId } }), 0);
    });

    it("a project paused after approval preflight prevents the source and schedule effect", async (t) => {
      const log = await submittedLog(25);
      await pauseBeforeTransaction(t);
      await assert.rejects(approveJobsiteLog(log.id, { ...ctx }), isCode("CONFLICT"));
      assert.equal(
        (await prisma.jobsiteLog.findUniqueOrThrow({ where: { id: log.id } })).status,
        "SUBMITTED",
      );
      assert.equal(
        (
          await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })
        ).progressPct.toString(),
        "0",
      );
    });

    async function draftReceipt() {
      await prisma.project.update({ where: { id: projectId }, data: { companyId } });
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          companyId,
          projectId,
          supplierContactId: contactId,
          number: 1,
          issueDate: new Date("2026-11-01"),
          status: "CONFIRMED",
          lines: {
            create: {
              wbsNodeId: wbsId,
              description: "Synthetic purchase",
              unit: "m2",
              quantity: 10,
              unitPrice: 1,
              lineSubtotal: 10,
              lineTotal: 10,
            },
          },
        },
        include: { lines: true },
      });
      return prisma.purchaseReceipt.create({
        data: {
          tenantId,
          companyId,
          projectId,
          purchaseOrderId: po.id,
          supplierContactId: contactId,
          receiptDate: new Date("2026-11-02"),
          lines: { create: { purchaseOrderLineId: po.lines[0]!.id, quantityReceived: 1 } },
        },
      });
    }

    it("receipt confirmation completes a linked milestone while preserving TASK progress", async () => {
      const milestone = await createScheduleItem(
        projectId,
        { name: "Synthetic arrival", type: "MILESTONE", wbsNodeId: wbsId },
        { ...ctx },
      );
      const receipt = await draftReceipt();
      await confirmPurchaseReceipt(receipt.id, { ...ctx });
      assert.equal(
        (await prisma.scheduleItem.findUniqueOrThrow({ where: { id: milestone.id } })).status,
        "COMPLETED",
      );
      assert.equal(
        (
          await prisma.scheduleItem.findUniqueOrThrow({ where: { id: firstId } })
        ).progressPct.toString(),
        "0",
      );
    });

    it("rejects a receipt line from a different order before changing quantities or milestones", async () => {
      const receipt = await draftReceipt();
      const otherOrder = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          companyId,
          projectId,
          supplierContactId: contactId,
          number: 2,
          issueDate: new Date("2026-11-01"),
          status: "CONFIRMED",
          lines: {
            create: {
              description: "Synthetic unrelated purchase",
              quantity: 10,
              unitPrice: 1,
              lineSubtotal: 10,
              lineTotal: 10,
            },
          },
        },
        include: { lines: true },
      });
      await prisma.purchaseReceiptLine.updateMany({
        where: { purchaseReceiptId: receipt.id },
        data: { purchaseOrderLineId: otherOrder.lines[0]!.id },
      });
      await assert.rejects(confirmPurchaseReceipt(receipt.id, { ...ctx }), isCode("CONFLICT"));
      assert.equal(
        (await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status,
        "DRAFT",
      );
      const lines = await prisma.purchaseOrderLine.findMany({
        where: { purchaseOrder: { tenantId } },
      });
      assert.ok(lines.every((line) => line.receivedQuantity.isZero()));
    });

    it("a project paused after receipt preflight prevents its milestone and quantity effects", async (t) => {
      const milestone = await createScheduleItem(
        projectId,
        { name: "Synthetic arrival", type: "MILESTONE", wbsNodeId: wbsId },
        { ...ctx },
      );
      const receipt = await draftReceipt();
      await pauseBeforeTransaction(t);
      await assert.rejects(confirmPurchaseReceipt(receipt.id, { ...ctx }), isCode("CONFLICT"));
      assert.equal(
        (await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status,
        "DRAFT",
      );
      assert.equal(
        (await prisma.scheduleItem.findUniqueOrThrow({ where: { id: milestone.id } })).status,
        "PLANNED",
      );
      assert.equal(
        (
          await prisma.purchaseOrderLine.findFirstOrThrow({
            where: { purchaseOrder: { tenantId } },
          })
        ).receivedQuantity.toString(),
        "0",
      );
    });
  },
);
