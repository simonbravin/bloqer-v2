import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, prisma } from "@bloqer/database";

import { getProjectScheduleSummary, getProjectScheduleWorkspace } from "./schedule-workspace.service";
import type { ServiceContext } from "../types";

test("schedule workspace omits stale former-container dates from its KPI", async (t) => {
  function mockQuery(target: object, method: string, result: unknown) {
    const delegate = target as Record<string, unknown>;
    const original = delegate[method];
    delegate[method] = async () => result;
    t.after(() => {
      delegate[method] = original;
    });
    return (replacement: unknown) => { result = replacement; };
  }
  const former = {
    id: "former-container",
    parentId: null,
    name: "Contenedor anterior",
    sortOrder: 1,
    type: "TASK",
    status: "PLANNED",
    blockReason: null,
    startDate: new Date("2026-05-01"),
    endDate: new Date("2026-06-01"),
    durationDays: 31,
    progressPct: new Prisma.Decimal(0),
    wbsLinks: [],
    predecessors: [],
    successors: [],
  };
  const rows = [
    former,
    { ...former, id: "cancelled-child", parentId: former.id, status: "CANCELLED" },
    {
      ...former,
      id: "active-leaf",
      status: "COMPLETED",
      durationDays: 1,
      progressPct: new Prisma.Decimal(100),
    },
  ];
  mockQuery(prisma.tenantModuleSetting, "findMany", [
    { moduleKey: "BUDGETS", isEnabled: false },
    { moduleKey: "PROCUREMENT", isEnabled: false },
  ]);
  mockQuery(prisma.project, "findUnique", {
    id: "project",
    tenantId: "tenant",
    companyId: "company",
    status: "ACTIVE",
  });
  mockQuery(prisma.tenant, "findUnique", { projectAccessMode: "TENANT_WIDE" });
  const setSchedule = mockQuery(prisma.schedule, "findUnique", {
    id: "schedule",
    tenantId: "tenant",
    baselineBudgetId: null,
  });
  mockQuery(prisma.scheduleItem, "count", 2);
  mockQuery(prisma.scheduleItem, "findMany", rows);

  const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["OWNER"] };
  const result = await getProjectScheduleWorkspace("project", {}, ctx);

  if (result.type !== "WORKSPACE") return assert.fail("Expected a workspace");
  assert.equal(result.items.find((item) => item.id === former.id)?.endDate, null);
  assert.equal(result.summary.delayedItems, 0);
  assert.equal(result.summary.scheduleProgressPct, "50.00");
  assert.deepEqual(await getProjectScheduleSummary("project", ctx), {
    delayedItems: 0, completedItems: 1, scheduleProgressPct: "50.00",
  });
  setSchedule(null);
  const create = prisma.schedule.create;
  prisma.schedule.create = () => assert.fail("Overview must not seed a schedule");
  t.after(() => { prisma.schedule.create = create; });
  assert.deepEqual(await getProjectScheduleSummary("project", ctx), {
    delayedItems: 0, completedItems: 0, scheduleProgressPct: null,
  });
});
