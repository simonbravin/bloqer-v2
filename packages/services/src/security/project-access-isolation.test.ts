import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";
import { listSupportedTenantModules } from "@bloqer/domain";

import {
  activateProject, cancelProject, completeProject, createProject, getProjectById,
  getProjectClientContactId, getProjectShellInfo, isProjectTypeLocked, listProjects,
  pauseProject, reactivateProject, resumeProject, updateProject,
} from "../project/project.service";
import { ServiceError, type ServiceContext } from "../types";
import {
  canAccessProject,
  clearProjectAccessModeCache,
  filterUserIdsByProjectAccess,
  requireProjectAccess,
  resolveAccessibleProjectScope,
} from "./access";

const projectId = "00000000-0000-0000-0000-000000000001";
const tenantId = "00000000-0000-0000-0000-000000000002";
const companyId = "00000000-0000-0000-0000-000000000003";
const otherCompanyId = "00000000-0000-0000-0000-000000000004";

function context(overrides: Partial<ServiceContext> = {}): ServiceContext {
  return { tenantId, companyId, actorUserId: "actor", roles: ["PROJECT_MANAGER"], ...overrides };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: projectId, tenantId, companyId, status: "ACTIVE", country: "AR",
    code: "AUDIT-01", name: "Synthetic project", clientContactId: "client", ...overrides,
  };
}

const originalsByTest = new WeakMap<TestContext, Map<object, Map<string, unknown>>>();

function stub(t: TestContext, delegate: object, method: string, replacement: unknown): void {
  const target = delegate as Record<string, unknown>;
  let delegates = originalsByTest.get(t);
  if (!delegates) {
    delegates = new Map();
    originalsByTest.set(t, delegates);
  }
  let methods = delegates.get(delegate);
  if (!methods) {
    methods = new Map();
    delegates.set(delegate, methods);
  }
  if (!methods.has(method)) {
    const original = target[method];
    methods.set(method, original);
    t.after(() => { target[method] = original; });
  }
  target[method] = replacement;
}

function setup(t: TestContext, mode: "TENANT_WIDE" | "MEMBERSHIP_SCOPED" = "TENANT_WIDE") {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: mode }));
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.company, "findMany", async () => [{ id: companyId }, { id: otherCompanyId }]);
  stub(t, prisma.project, "findUnique", async () => project());
  stub(t, prisma.projectMembership, "findUnique", async () => null);
}

function forbidden(error: unknown): boolean {
  return error instanceof ServiceError && error.code === "FORBIDDEN";
}

describe("project access isolation (actual services, no database)", { concurrency: false }, () => {
  it("rejects a foreign tenant before looking up membership", async (t) => {
    setup(t, "MEMBERSHIP_SCOPED");
    stub(t, prisma.project, "findUnique", async () => project({ tenantId: "foreign" }));
    const membership = t.mock.fn(async () => ({ id: "membership" }));
    stub(t, prisma.projectMembership, "findUnique", membership);
    await assert.rejects(() => requireProjectAccess(projectId, context()), forbidden);
    assert.equal(await canAccessProject(projectId, context()), false);
    assert.equal(membership.mock.callCount(), 0);
  });

  for (const roles of [["OWNER"], ["PROJECT_MANAGER"]] as ServiceContext["roles"][]) {
    it(`rejects another company for ${roles[0]} even in TENANT_WIDE`, async (t) => {
      setup(t);
      stub(t, prisma.project, "findUnique", async () => project({ companyId: otherCompanyId }));
      await assert.rejects(() => requireProjectAccess(projectId, context({ roles })), forbidden);
      assert.equal(await canAccessProject(projectId, context({ roles })), false);
    });
  }

  it("keeps shared projects visible to a company context", async (t) => {
    setup(t);
    stub(t, prisma.project, "findUnique", async () => project({ companyId: null }));
    assert.equal((await requireProjectAccess(projectId, context())).id, projectId);
    assert.equal(await canAccessProject(projectId, context()), true);
  });

  it("requires membership for a shared project under MEMBERSHIP_SCOPED", async (t) => {
    setup(t, "MEMBERSHIP_SCOPED");
    stub(t, prisma.project, "findUnique", async () => project({ companyId: null }));
    await assert.rejects(() => requireProjectAccess(projectId, context()), forbidden);
    stub(t, prisma.projectMembership, "findUnique", async () => ({ id: "membership" }));
    assert.equal((await requireProjectAccess(projectId, context())).id, projectId);
  });

  for (const load of [getProjectShellInfo, getProjectClientContactId, getProjectById]) {
    it(`${load.name} enforces membership before returning project data`, async (t) => {
      setup(t, "MEMBERSHIP_SCOPED");
      await assert.rejects(() => load(projectId, context()), forbidden);
      stub(t, prisma.projectMembership, "findUnique", async () => ({ id: "membership" }));
      assert.ok(await load(projectId, context()));
    });

    it(`${load.name} rejects cross-company data`, async (t) => {
      setup(t);
      stub(t, prisma.project, "findUnique", async () => project({ companyId: otherCompanyId }));
      await assert.rejects(() => load(projectId, context({ roles: ["OWNER"] })), forbidden);
    });
  }

  it("shell denies all disabled areas but permits AP when PROJECTS is disabled", async (t) => {
    setup(t);
    let apEnabled = false;
    stub(t, prisma.tenantModuleSetting, "findMany", async () => listSupportedTenantModules()
      .map(({ moduleKey }) => ({ moduleKey, isEnabled: apEnabled && moduleKey === "AP" })));
    await assert.rejects(() => getProjectShellInfo(projectId, context()), forbidden);
    await assert.rejects(() => getProjectClientContactId(projectId, context()), forbidden);
    apEnabled = true;
    assert.equal((await getProjectShellInfo(projectId, context())).id, projectId);
  });

  const primaryOperations: Array<[string, (ctx: ServiceContext) => Promise<unknown>]> = [
    ["read", (ctx) => getProjectById(projectId, ctx)],
    ["list", (ctx) => listProjects({}, ctx)],
    ["create", (ctx) => createProject({
      code: "AUDIT", name: "Synthetic", clientContactId: "client", type: "PRIVATE",
    }, ctx)],
    ["type lock", (ctx) => isProjectTypeLocked(projectId, ctx)],
    ["update", (ctx) => updateProject(projectId, {}, ctx)],
    ["activate", (ctx) => activateProject(projectId, ctx)],
    ["pause", (ctx) => pauseProject(projectId, ctx)],
    ["resume", (ctx) => resumeProject(projectId, ctx)],
    ["complete", (ctx) => completeProject(projectId, ctx)],
    ["cancel", (ctx) => cancelProject(projectId, ctx)],
    ["reactivate", (ctx) => reactivateProject(projectId, ctx, { reason: "Synthetic reason" })],
  ];
  for (const [name, operate] of primaryOperations) {
    it(`primary project ${name} rejects a disabled PROJECTS module`, async (t) => {
      setup(t);
      stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "PROJECTS", isEnabled: false }]);
      await assert.rejects(() => operate(context({ roles: ["OWNER"] })), forbidden);
    });
  }

  for (const [name, operate] of primaryOperations.filter(([name]) =>
    !["read", "list", "create", "reactivate"].includes(name))) {
    it(`primary project ${name} rejects an unassigned project`, async (t) => {
      setup(t, "MEMBERSHIP_SCOPED");
      await assert.rejects(() => operate(context()), forbidden);
    });
  }

  it("global company context keeps TENANT_WIDE scope without enumerating projects", async (t) => {
    setup(t);
    const lookup = t.mock.fn(async () => []);
    stub(t, prisma.project, "findMany", lookup);
    assert.equal(await resolveAccessibleProjectScope(context({ companyId: null })), "ALL");
    assert.equal(lookup.mock.callCount(), 0);
  });

  it("company context scopes both project list and count before pagination/search", async (t) => {
    setup(t);
    const findMany = t.mock.fn(async (args: { select: { name?: boolean }; where: unknown }) =>
      args.select.name ? [project()] : [{ id: projectId }]);
    const count = t.mock.fn(async () => 1);
    stub(t, prisma.project, "findMany", findMany);
    stub(t, prisma.project, "count", count);
    const result = await listProjects({ search: "Synthetic", pageSize: 10 }, context());
    assert.equal(result.total, 1);
    assert.deepEqual(findMany.mock.calls[0]!.arguments[0].where, {
      tenantId, OR: [{ companyId }, { companyId: null }],
    });
    const listWhere = findMany.mock.calls[1]!.arguments[0].where;
    assert.deepEqual(listWhere, {
      tenantId,
      id: { in: [projectId] },
      OR: [
        { name: { contains: "Synthetic", mode: "insensitive" } },
        { code: { contains: "Synthetic", mode: "insensitive" } },
        { city: { contains: "Synthetic", mode: "insensitive" } },
      ],
    });
    assert.deepEqual(count.mock.calls[0]!.arguments, [{ where: listWhere }]);
  });

  it("membership scope intersects the membership with tenant and company", async (t) => {
    setup(t, "MEMBERSHIP_SCOPED");
    const lookup = t.mock.fn(async () => [{ projectId }]);
    stub(t, prisma.projectMembership, "findMany", lookup);
    assert.deepEqual(await resolveAccessibleProjectScope(context()), { projectIds: [projectId] });
    assert.deepEqual(lookup.mock.calls[0]!.arguments, [{
      where: {
        tenantId, userId: "actor",
        project: { tenantId, OR: [{ companyId }, { companyId: null }] },
      },
      select: { projectId: true },
    }]);
  });

  for (const mode of ["TENANT_WIDE", "MEMBERSHIP_SCOPED"] as const) {
    it(`fan-out excludes foreign companies and inactive/missing memberships in ${mode}`, async (t) => {
      setup(t, mode);
      stub(t, prisma.userMembership, "findMany", async () => [
        { userId: "own", roles: ["PROJECT_MANAGER"], companyId },
        { userId: "other", roles: ["OWNER"], companyId: otherCompanyId },
        { userId: "global", roles: ["OWNER"], companyId: null },
      ]);
      stub(t, prisma.projectMembership, "findMany", async () => [
        { userId: "own" }, { userId: "other" }, { userId: "inactive" },
      ]);
      assert.deepEqual(
        await filterUserIdsByProjectAccess(tenantId, projectId, ["own", "other", "global", "inactive", "own"]),
        ["own", "global"],
      );
    });
  }

  it("fan-out uses D092 sole-active-company fallback for a null membership company", async (t) => {
    setup(t);
    stub(t, prisma.project, "findUnique", async () => project({ companyId: otherCompanyId }));
    stub(t, prisma.userMembership, "findMany", async () => [{ userId: "global", roles: ["OWNER"], companyId: null }]);
    stub(t, prisma.company, "findMany", async () => [{ id: companyId }]);
    assert.deepEqual(await filterUserIdsByProjectAccess(tenantId, projectId, ["global"]), []);
  });
});
