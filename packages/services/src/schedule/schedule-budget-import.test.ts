import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { ensureScheduleForProject, importScheduleFromBudget } from "./schedule.service";

const ctx: ServiceContext = {
  tenantId: "tenant",
  companyId: null,
  actorUserId: "owner",
  roles: ["OWNER"],
};
const projectId = "project";
const budgetId = "budget";
const originalMethods = new WeakMap<TestContext, Map<object, Set<string>>>();
function stub(t: TestContext, target: object, key: string, replacement: unknown) {
  const delegate = target as Record<string, unknown>;
  let objects = originalMethods.get(t);
  if (!objects) {
    objects = new Map();
    originalMethods.set(t, objects);
  }
  let keys = objects.get(target);
  if (!keys) {
    keys = new Set();
    objects.set(target, keys);
  }
  if (!keys.has(key)) {
    const original = delegate[key];
    keys.add(key);
    t.after(() => {
      delegate[key] = original;
    });
  }
  delegate[key] = replacement;
}

function setup(t: TestContext) {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  const project = {
    id: projectId,
    tenantId: ctx.tenantId,
    companyId: null,
    status: "ACTIVE",
    country: "AR",
  };
  const state = {
    freshStatus: "ACTIVE",
    emptyTree: false,
    budgetAvailable: true,
    failAudit: false,
    disabledModules: [] as string[],
    queryOrder: [] as string[],
    schedule: null as null | {
      id: string;
      tenantId: string;
      projectId: string;
      type: string;
      baselineBudgetId: string | null;
    },
    items: [] as Array<Record<string, unknown>>,
    links: [] as Array<{ wbsNodeId: string; scheduleItemId: string }>,
    audit: [] as Array<Record<string, unknown>>,
  };
  stub(t, prisma.project, "findUnique", async () => project);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE" }));
  stub(t, prisma.tenantModuleSetting, "findMany", async () =>
    state.disabledModules.map((moduleKey) => ({ moduleKey, isEnabled: false })),
  );
  stub(t, prisma.schedule, "findUnique", async () => state.schedule);
  // Fail if a dependent write escapes the transaction.
  for (const [delegate, method] of [
    [prisma.schedule, "create"],
    [prisma.schedule, "update"],
    [prisma.auditLog, "create"],
  ] as const) {
    stub(t, delegate, method, async () => {
      throw new Error("Write escaped transaction");
    });
  }
  stub(t, prisma, "$transaction", async (operation: (tx: unknown) => Promise<unknown>) => {
    const draft = structuredClone({
      schedule: state.schedule,
      items: state.items,
      links: state.links,
      audit: state.audit,
    });
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        state.queryOrder.push(parts.join(""));
        return [];
      },
      project: {
        findFirst: async () => ({ ...project, status: state.freshStatus }),
        findUnique: async () => ({ startDate: null, expectedEndDate: null }),
      },
      budget: { findFirst: async () => (state.budgetAvailable ? { id: budgetId } : null) },
      wbsNode: {
        findMany: async () =>
          state.emptyTree
            ? []
            : [
                {
                  id: "nested",
                  parentId: "root",
                  code: "1.1",
                  name: "Subcapítulo",
                  type: "GROUP",
                  sortOrder: 0,
                },
                {
                  id: "root",
                  parentId: null,
                  code: "1",
                  name: "Capítulo",
                  type: "GROUP",
                  sortOrder: 0,
                },
                {
                  id: "leaf",
                  parentId: "nested",
                  code: "1.1.1",
                  name: "Partida",
                  type: "ITEM",
                  sortOrder: 0,
                },
              ],
      },
      schedule: {
        findFirst: async () => draft.schedule,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          draft.schedule = {
            id: "schedule",
            tenantId: ctx.tenantId,
            projectId,
            type: String(data.type),
            baselineBudgetId: null,
          };
          return draft.schedule;
        },
        update: async ({ data }: { data: { baselineBudgetId: string } }) => {
          draft.schedule!.baselineBudgetId = data.baselineBudgetId;
          return draft.schedule;
        },
        findUniqueOrThrow: async () => ({ ...draft.schedule, items: draft.items }),
      },
      scheduleItemWbsLink: {
        findMany: async () => draft.links,
        createMany: async ({
          data,
        }: {
          data: Array<{ wbsNodeId: string; scheduleItemId: string }>;
        }) => {
          draft.links.push(...data);
          return { count: data.length };
        },
      },
      scheduleItem: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          draft.items.push(
            ...data.map((item) => ({
              startDate: null,
              endDate: null,
              durationDays: null,
              ...item,
              progressPct: "0",
              blockReason: null,
            })),
          );
          return { count: data.length };
        },
        findMany: async () => draft.items,
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (state.failAudit) throw new Error("Synthetic audit failure");
          draft.audit.push(data);
          return data;
        },
      },
    };
    const result = await operation(tx);
    Object.assign(state, draft);
    return result;
  });
  return state;
}

describe("budget to schedule transactional import", { concurrency: false }, () => {
  it("imports parents before descendants, sets baseline and records both events atomically", async (t) => {
    const state = setup(t);
    const result = await importScheduleFromBudget(projectId, { budgetId }, ctx);
    assert.equal(result.baselineBudgetId, budgetId);
    assert.equal(result.items.length, 3);
    assert.equal(result.items[1]!.parentId, result.items[0]!.id);
    assert.equal(result.items[2]!.parentId, result.items[1]!.id);
    assert.deepEqual(
      state.audit.map((entry) => entry.action),
      ["schedule.created", "schedule.imported_from_budget"],
    );
    assert.match(state.queryOrder[0]!, /FROM projects.*FOR NO KEY UPDATE/);
    assert.match(state.queryOrder[1]!, /FROM budgets.*FOR UPDATE/);
  });

  it("a retry reuses the schedule and existing links without duplicate tasks or import events", async (t) => {
    const state = setup(t);
    await importScheduleFromBudget(projectId, { budgetId }, ctx);
    await importScheduleFromBudget(projectId, { budgetId }, ctx);
    assert.equal(state.items.length, 3);
    assert.equal(
      state.audit.filter((entry) => entry.action === "schedule.imported_from_budget").length,
      1,
    );
  });

  it("audits a baseline change even when the imported budget has no WBS nodes", async (t) => {
    const state = setup(t);
    state.emptyTree = true;
    await importScheduleFromBudget(projectId, { budgetId }, ctx);
    const events = state.audit.filter((entry) => entry.action === "schedule.imported_from_budget");
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.before, { baselineBudgetId: null });
    assert.deepEqual(events[0]!.after, { budgetId, baselineBudgetId: budgetId, importedCount: 0 });
  });

  it("an audit failure rolls back the new schedule, baseline, links and tasks", async (t) => {
    const state = setup(t);
    state.failAudit = true;
    await assert.rejects(
      importScheduleFromBudget(projectId, { budgetId }, ctx),
      /Synthetic audit failure/,
    );
    assert.equal(state.schedule, null);
    assert.deepEqual(state.items, []);
    assert.deepEqual(state.links, []);
  });

  it("rechecks paused project inside the write transaction", async (t) => {
    const state = setup(t);
    state.freshStatus = "ON_HOLD";
    await assert.rejects(
      importScheduleFromBudget(projectId, { budgetId }, ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT",
    );
    assert.equal(state.schedule, null);
  });

  it("does not create a schedule or change baseline for an unavailable budget", async (t) => {
    const state = setup(t);
    state.budgetAvailable = false;
    await assert.rejects(
      importScheduleFromBudget(projectId, { budgetId }, ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND",
    );
    assert.equal(state.schedule, null);
  });

  for (const moduleKey of ["PROJECTS", "SCHEDULE", "BUDGETS"]) {
    it(`rejects import when ${moduleKey} is disabled`, async (t) => {
      const state = setup(t);
      state.disabledModules = [moduleKey];
      await assert.rejects(
        importScheduleFromBudget(projectId, { budgetId }, ctx),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
      );
      assert.equal(state.schedule, null);
    });
  }

  it("does not create a missing schedule for a reader", async (t) => {
    const state = setup(t);
    await assert.rejects(
      ensureScheduleForProject(projectId, { ...ctx, roles: ["VIEWER"] }),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
    );
    assert.equal(state.schedule, null);
  });

  it("rolls back schedule creation when its audit fails", async (t) => {
    const state = setup(t);
    state.failAudit = true;
    await assert.rejects(ensureScheduleForProject(projectId, ctx), /Synthetic audit failure/);
    assert.equal(state.schedule, null);
  });
});
