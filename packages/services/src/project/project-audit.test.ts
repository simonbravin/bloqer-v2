import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma, Prisma, type Project } from "@bloqer/database";
import { getBudgetLifecycleLog } from "../budget/budget.service";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { getProjectCancellationImpact, resolveReactivationTargetStatus } from "./project-cancellation-impact.service";
import { addProjectTeamMember, listActiveMembersForProjectTeamPicker, listProjectTeam, removeProjectTeamMember } from "./project-team.service";
import { activateProject, cancelProject, completeProject, createProject, getProjectById, listProjects, reactivateProject, updateProject } from "./project.service";

const tenantId = "00000000-0000-0000-0000-000000000001";
const projectId = "00000000-0000-0000-0000-000000000002";
const companyId = "00000000-0000-0000-0000-000000000003";
const clientId = "00000000-0000-0000-0000-000000000004";
const ctx: ServiceContext = { tenantId, companyId, actorUserId: "actor", roles: ["OWNER"] };
const newProject = { code: "AUDIT-03", name: "Obra sintética", type: "PRIVATE" as const, clientContactId: clientId };

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: projectId, tenantId, companyId, clientContactId: clientId,
    code: "AUDIT-03", name: "Obra sintética", type: "PRIVATE", status: "ACTIVE",
    description: null, address: null, city: null, province: null, country: "AR",
    statusBeforeCancellation: null, cancellationReason: null, cancelledAt: null,
    startDate: null, expectedEndDate: null, actualEndDate: null, notes: null,
    allowApprovedBudgetEconomicEdits: false, createdBy: "actor", updatedBy: "actor",
    createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const originals = new WeakMap<TestContext, Map<object, Set<string>>>();
function stub(t: TestContext, target: object, key: string, replacement: unknown): void {
  const delegate = target as Record<string, unknown>;
  let objects = originals.get(t);
  if (!objects) { objects = new Map(); originals.set(t, objects); }
  let methods = objects.get(target);
  if (!methods) { methods = new Set(); objects.set(target, methods); }
  if (!methods.has(key)) {
    const original = delegate[key];
    t.after(() => { delegate[key] = original; });
    methods.add(key);
  }
  delegate[key] = replacement;
}

function setup(t: TestContext, initial: Partial<Project> = {}) {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  const state = {
    row: project(initial), audit: [] as Array<Record<string, unknown>>,
    failAudit: false, beforeWrite: undefined as (() => void) | undefined,
    duplicateCode: false,
    accessMode: "TENANT_WIDE" as "TENANT_WIDE" | "MEMBERSHIP_SCOPED",
    projectMembers: [] as Array<{ id: string; tenantId: string; projectId: string; userId: string }>,
    membershipAttempts: 0,
    txClientStatus: "ACTIVE",
    txClientRoleStatus: "ACTIVE",
    queries: [] as string[],
  };
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: state.accessMode }));
  stub(t, prisma.company, "findFirst", async () => ({ id: companyId }));
  stub(t, prisma.company, "findMany", async () => [{ id: companyId }]);
  stub(t, prisma.contact, "findUnique", async () => ({ id: clientId, tenantId, status: "ACTIVE" }));
  stub(t, prisma.contactRole, "findUnique", async () => ({ tenantId, status: "ACTIVE" }));
  stub(t, prisma.budget, "findFirst", async () => null);
  stub(t, prisma.project, "findUnique", async (args: { where: { id?: string } }) => args.where.id ? { ...state.row } : null);
  stub(t, prisma.projectMembership, "findUnique", async (args: { where: { tenantId_projectId_userId: { userId: string; projectId: string } } }) => state.projectMembers.find((member) => member.projectId === args.where.tenantId_projectId_userId.projectId && member.userId === args.where.tenantId_projectId_userId.userId) ?? null);
  stub(t, prisma.projectMembership, "findMany", async () => state.projectMembers);
  stub(t, prisma.projectTeamMember, "create", async () => ({ id: "roster-member" }));
  for (const delegate of [prisma.purchaseOrder, prisma.purchaseRequest, prisma.certification, prisma.supplierInvoice, prisma.salesInvoice, prisma.collection, prisma.payment, prisma.receivable, prisma.payable, prisma.subcontract]) {
    stub(t, delegate, "count", async () => 0);
  }
  stub(t, prisma, "$transaction", async (operation: (transaction: unknown) => Promise<unknown>) => {
    state.beforeWrite?.();
    let row = { ...state.row };
    const audit: Array<Record<string, unknown>> = [];
    const projectMembers = [...state.projectMembers];
    const transaction = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        state.queries.push(parts.join(""));
        return [{ id: projectId }];
      },
      project: {
        create: async ({ data }: { data: Partial<Project> }) => {
          if (state.duplicateCode) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test", meta: { target: ["tenant_id", "code"] } });
          row = project({ ...data, status: "DRAFT" });
          return row;
        },
        updateMany: async ({ where, data }: { where: { status: string; updatedAt: Date }; data: Partial<Project> }) => {
          if (row.status !== where.status || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
          row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1) };
          return { count: 1 };
        },
        findUniqueOrThrow: async () => row,
        findFirst: async () => row,
      },
      budget: { findFirst: async () => null },
      tenant: { findUnique: async () => ({ projectAccessMode: state.accessMode }) },
      contact: { findUnique: async () => ({ id: clientId, tenantId, status: state.txClientStatus }) },
      contactRole: { findUnique: async () => ({ tenantId, status: state.txClientRoleStatus }) },
      projectMembership: { create: async ({ data }: { data: { tenantId: string; projectId: string; userId: string } }) => {
        state.membershipAttempts += 1;
        const member = { id: "creator-membership", ...data };
        projectMembers.push(member);
        return member;
      } },
      ...Object.fromEntries(["purchaseOrder", "purchaseRequest", "certification", "supplierInvoice", "salesInvoice", "collection", "payment", "receivable", "payable", "subcontract"].map((name) => [name, { count: async () => 0 }])),
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.failAudit) throw new Error("audit unavailable");
        audit.push(data);
        return { id: "audit", ...data };
      } },
    };
    const result = await operation(transaction);
    state.row = row;
    state.audit.push(...audit);
    state.projectMembers = projectMembers;
    return result;
  });
  return state;
}

function errorCode(code: ServiceError["code"]) {
  return (error: unknown) => error instanceof ServiceError && error.code === code;
}

describe("AG-03 project regressions (actual services, no database)", { concurrency: false }, () => {
  for (const code of ["AUDIT-03", "AUDIT-CHANGED"]) {
    it(`takes Tenant KEY SHARE before the project write lock when code=${code}`, async (t) => {
      const state = setup(t);
      await updateProject(projectId, { code }, ctx);
      assert.match(state.queries[0] ?? "", /FROM tenants .*FOR KEY SHARE/);
      assert.match(state.queries[1] ?? "", /FROM projects .*FOR NO KEY UPDATE/);
      assert.equal(state.row.code, code);
      assert.equal(state.audit.length, 1);
    });
  }

  it("keeps metadata edits without code on the ordinary project lock path", async (t) => {
    const state = setup(t);
    await updateProject(projectId, { name: "Updated metadata" }, ctx);
    assert.equal(state.queries.length, 1);
    assert.match(state.queries[0] ?? "", /FROM projects .*FOR NO KEY UPDATE/);
  });

  it("guards budget lifecycle comments with project ACL before reading audit rows", async (t) => {
    const state = setup(t);
    state.accessMode = "MEMBERSHIP_SCOPED";
    stub(t, prisma.budget, "findUnique", async () => ({ id: "budget", tenantId, projectId }));
    const query = t.mock.fn(async () => []);
    stub(t, prisma.auditLog, "findMany", query);
    await assert.rejects(() => getBudgetLifecycleLog("budget", { ...ctx, roles: ["PROJECT_MANAGER"] }), errorCode("FORBIDDEN"));
    assert.equal(query.mock.callCount(), 0);
  });

  for (const mutation of ["create", "change client"] as const) {
    for (const deactivated of ["contact", "CLIENT role"] as const) {
      it(`rechecks an inactive ${deactivated} under the transaction lock before project ${mutation}`, async (t) => {
        const state = setup(t);
        state.beforeWrite = () => {
          if (deactivated === "contact") state.txClientStatus = "ARCHIVED";
          else state.txClientRoleStatus = "INACTIVE";
        };
        await assert.rejects(() => mutation === "create"
          ? createProject(newProject, ctx)
          : updateProject(projectId, { clientContactId: "changed-client" }, ctx), errorCode("CONFLICT"));
        assert.equal(state.audit.length, 0);
        assert.equal(state.row.clientContactId, clientId);
      });
    }
  }

  it("assigns a scoped creator only to the newly created project and refreshes its cached list", async (t) => {
    const state = setup(t);
    state.accessMode = "MEMBERSHIP_SCOPED";
    const pm = { ...ctx, roles: ["PROJECT_MANAGER"] as ServiceContext["roles"] };
    const listed = (args: { where: { id: { in: string[] } } }) => args.where.id.in.includes(projectId) ? [state.row] : [];
    stub(t, prisma.project, "findMany", async (args: Parameters<typeof listed>[0]) => listed(args));
    stub(t, prisma.project, "count", async (args: Parameters<typeof listed>[0]) => listed(args).length);
    assert.equal((await listProjects({}, pm)).total, 0);
    const created = await createProject(newProject, pm);
    assert.equal((await getProjectById(created.id, pm)).id, created.id);
    assert.equal((await listProjects({}, pm)).total, 1);
    assert.deepEqual(state.projectMembers.map(({ tenantId: tenant, projectId: id, userId }) => ({ tenant, id, userId })), [{ tenant: tenantId, id: created.id, userId: ctx.actorUserId }]);
    assert.ok((state.audit[0]?.after as Record<string, unknown>).creatorMembership);
    stub(t, prisma.project, "findUnique", async () => project({ id: "unassigned" }));
    await assert.rejects(() => getProjectById("unassigned", pm), errorCode("FORBIDDEN"));
  });

  it("rolls back the creator assignment together with project creation when auditing fails", async (t) => {
    const state = setup(t);
    state.accessMode = "MEMBERSHIP_SCOPED";
    state.failAudit = true;
    await assert.rejects(() => createProject(newProject, { ...ctx, roles: ["PROJECT_MANAGER"] }), /audit unavailable/);
    assert.equal(state.membershipAttempts, 1);
    assert.equal(state.projectMembers.length, 0);
    assert.equal(state.audit.length, 0);
  });

  it("does not add redundant access assignments for a tenant-wide creator", async (t) => {
    const state = setup(t);
    await createProject(newProject, { ...ctx, roles: ["PROJECT_MANAGER"] });
    state.accessMode = "MEMBERSHIP_SCOPED";
    await createProject(newProject, ctx);
    assert.equal(state.membershipAttempts, 0);
  });

  it("validates partial date edits against persisted dates and permits explicit clearing", async (t) => {
    const state = setup(t, { startDate: new Date("2026-03-10"), expectedEndDate: new Date("2026-03-20") });
    await assert.rejects(() => updateProject(projectId, { expectedEndDate: new Date("2026-03-01") }, ctx), errorCode("VALIDATION"));
    await assert.rejects(() => updateProject(projectId, { startDate: new Date("2026-04-01") }, ctx), errorCode("VALIDATION"));
    assert.equal(state.audit.length, 0);
    const cleared = await updateProject(projectId, { startDate: null, expectedEndDate: null }, ctx);
    assert.equal(cleared.startDate, null);
    assert.equal(cleared.expectedEndDate, null);
    assert.equal(state.audit[0]?.projectId, projectId);
  });

  it("records changed client, classification and dates in the same scoped audit event", async (t) => {
    const state = setup(t);
    const updated = await updateProject(projectId, { clientContactId: "another-client", type: "PUBLIC", startDate: new Date("2026-02-01") }, ctx);
    assert.equal(updated.clientContactId, "another-client");
    const before = state.audit[0]?.before as Record<string, unknown>;
    const after = state.audit[0]?.after as Record<string, unknown>;
    assert.equal(before.clientContactId, clientId);
    assert.equal(after.clientContactId, "another-client");
    assert.equal(after.type, "PUBLIC");
    assert.ok(after.startDate);
  });

  it("rejects completion before a future project start without writing an event", async (t) => {
    const state = setup(t, { startDate: new Date("2999-01-01") });
    await assert.rejects(() => completeProject(projectId, ctx), errorCode("VALIDATION"));
    assert.equal(state.row.status, "ACTIVE");
    assert.equal(state.audit.length, 0);
  });

  for (const [name, initial, mutate] of [
    ["create", { status: "ACTIVE" }, () => createProject(newProject, ctx)],
    ["edit", {}, () => updateProject(projectId, { name: "Cambio" }, ctx)],
    ["activate", { status: "DRAFT" }, () => activateProject(projectId, ctx)],
    ["reactivate", { status: "CANCELLED", statusBeforeCancellation: "ON_HOLD" }, () => reactivateProject(projectId, ctx, { reason: "Corregir cancelación" })],
  ] as const) {
    it(`rolls back project ${name} when its audit event fails`, async (t) => {
      const state = setup(t, initial);
      state.failAudit = true;
      const before = { ...state.row };
      await assert.rejects(mutate, /audit unavailable/);
      assert.deepEqual(state.row, before);
      assert.equal(state.audit.length, 0);
    });
  }

  it("translates a concurrent tenant/code duplicate into a business conflict", async (t) => {
    const state = setup(t);
    state.duplicateCode = true;
    await assert.rejects(() => createProject(newProject, ctx), (error: unknown) => errorCode("CONFLICT")(error) && (error as Error).message.includes("AUDIT-03"));
    assert.equal(state.audit.length, 0);
  });

  it("rejects stale metadata instead of overwriting a concurrent edit", async (t) => {
    const state = setup(t);
    state.beforeWrite = () => { state.row = project({ name: "Edición concurrente", updatedAt: new Date("2026-02-01") }); };
    await assert.rejects(() => updateProject(projectId, { name: "Edición vieja" }, ctx), errorCode("CONFLICT"));
    assert.equal(state.row.name, "Edición concurrente");
    assert.equal(state.audit.length, 0);
  });

  it("does not save the wrong cancellation predecessor after a concurrent pause", async (t) => {
    const state = setup(t);
    state.beforeWrite = () => { state.row = project({ status: "ON_HOLD", updatedAt: new Date("2026-02-01") }); };
    await assert.rejects(() => cancelProject(projectId, ctx, { reason: "Prueba" }), errorCode("CONFLICT"));
    assert.equal(state.row.status, "ON_HOLD");
    assert.equal(state.row.statusBeforeCancellation, null);
    assert.equal(state.audit.length, 0);
  });

  it("rejects malformed pagination before querying project rows", async (t) => {
    setup(t);
    const query = t.mock.fn(async () => []);
    stub(t, prisma.project, "findMany", query);
    for (const page of [NaN, Infinity, 0, 1.5, Number.MAX_SAFE_INTEGER]) {
      await assert.rejects(() => listProjects({ page }, ctx), errorCode("VALIDATION"));
    }
    assert.equal(query.mock.callCount(), 0);
  });

  const guarded = [
    ["impact", () => getProjectCancellationImpact(projectId, ctx)],
    ["roster", () => listProjectTeam(projectId, ctx)],
    ["roster picker", () => listActiveMembersForProjectTeamPicker(projectId, ctx)],
    ["roster add", () => addProjectTeamMember(projectId, { userId: "target", kind: "OTHER" }, ctx)],
    ["roster remove", () => removeProjectTeamMember(projectId, "member", ctx)],
  ] as const;
  for (const [name, load] of guarded) {
    it(`${name} rejects a disabled PROJECTS module before any project lookup`, async (t) => {
      setup(t);
      stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "PROJECTS", isEnabled: false }]);
      const query = t.mock.fn(async () => { throw new Error("unexpected lookup"); });
      stub(t, prisma.project, "findUnique", query);
      await assert.rejects(load, errorCode("FORBIDDEN"));
      assert.equal(query.mock.callCount(), 0);
    });
  }

  it("cancellation impact denies unassigned projects before querying documents", async (t) => {
    setup(t);
    stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
    stub(t, prisma.projectMembership, "findUnique", async () => null);
    const query = t.mock.fn(async () => 0);
    stub(t, prisma.certification, "count", query);
    await assert.rejects(() => getProjectCancellationImpact(projectId, { ...ctx, roles: ["PROJECT_MANAGER"] }), errorCode("FORBIDDEN"));
    assert.equal(query.mock.callCount(), 0);
  });

  it("checks project ACL before loading full project metadata", async (t) => {
    setup(t);
    stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
    stub(t, prisma.projectMembership, "findUnique", async () => null);
    const query = t.mock.fn(async (args: { select: Record<string, unknown> }) => {
      assert.equal(args.select.client, undefined);
      assert.equal(args.select.notes, undefined);
      return project();
    });
    stub(t, prisma.project, "findUnique", query);
    await assert.rejects(() => getProjectById(projectId, { ...ctx, roles: ["PROJECT_MANAGER"] }), errorCode("FORBIDDEN"));
    assert.equal(query.mock.callCount(), 1);
  });

  for (const relation of ["certifications", "purchaseReceipts", "stockMovements", "jobsiteLogs"]) {
    it(`reactivates a legacy project with historical ${relation} conservatively to ON_HOLD`, async (t) => {
      setup(t);
      stub(t, prisma.project, "findFirst", async (args: { select: { _count: { select: Record<string, { where: Record<string, unknown> }> } } }) => {
        assert.deepEqual(args.select._count.select[relation]?.where, { tenantId });
        return { _count: { [relation]: 1 } };
      });
      assert.equal(await resolveReactivationTargetStatus(project()), "ON_HOLD");
    });
  }

  it("reactivates a legacy project without any activity to DRAFT", async (t) => {
    setup(t);
    stub(t, prisma.project, "findFirst", async () => ({ _count: { certifications: 0, budgets: 0, stockMovements: 0 } }));
    assert.equal(await resolveReactivationTargetStatus(project()), "DRAFT");
  });

  it("does not treat a globally inactive roster user as an active PM or supervisor", async (t) => {
    setup(t);
    stub(t, prisma.projectTeamMember, "findMany", async () => [{ id: "member", userId: "target", kind: "PROJECT_MANAGER", createdAt: new Date(), user: { email: "synthetic@example.test", name: "Sintético", status: "INACTIVE" } }]);
    stub(t, prisma.userMembership, "findMany", async () => [{ userId: "target", roles: ["PROJECT_MANAGER"], status: "ACTIVE" }]);
    const [member] = await listProjectTeam(projectId, ctx);
    assert.equal(member?.membershipActive, false);
    assert.equal(member?.canSuperviseJobsiteLog, false);
    assert.deepEqual(member?.roles, []);
  });

  it("filters the picker and roster addition to active global users", async (t) => {
    setup(t);
    stub(t, prisma.projectTeamMember, "findMany", async () => []);
    stub(t, prisma.userMembership, "findMany", async (args: { where: { user: { status: string } } }) => {
      assert.equal(args.where.user.status, "ACTIVE");
      return [];
    });
    stub(t, prisma.userMembership, "findFirst", async (args: { where: { user: { status: string } } }) => {
      assert.equal(args.where.user.status, "ACTIVE");
      return null;
    });
    assert.deepEqual(await listActiveMembersForProjectTeamPicker(projectId, ctx), []);
    await assert.rejects(() => addProjectTeamMember(projectId, { userId: "target", kind: "OTHER" }, ctx), errorCode("VALIDATION"));
  });
});
