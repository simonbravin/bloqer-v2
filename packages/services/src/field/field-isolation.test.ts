import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";

import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { assertPreferredProjectAccess, getFieldHome, listFieldProjects } from "./field-home.service";
import { getMyFieldPendingItems, type FieldPendingCounts } from "./field-pending.service";

const assignedId = "00000000-0000-4000-8000-000000000001";
const unassignedId = "00000000-0000-4000-8000-000000000002";
const ctx: ServiceContext = {
  tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["PROJECT_MANAGER"],
};
const pendingCounts: FieldPendingCounts = {
  total: 0, purchaseRequests: 0, purchaseOrders: 0, purchaseOrdersToConfirm: 0,
  purchaseOrdersToReceive: 0, purchaseOrdersToInvoice: 0, jobsiteLogs: 0,
  certifications: 0, subcontractCertifications: 0,
};

function stub(t: TestContext, delegate: object, method: string, replacement: unknown): void {
  const target = delegate as Record<string, unknown>;
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
}

function setup(t: TestContext) {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  stub(t, prisma.projectMembership, "findMany", async () => [{ projectId: assignedId }]);
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
}

describe("Field project/company isolation", { concurrency: false }, () => {
  it("project overview uses accessible scope before applying its limit", async (t) => {
    setup(t);
    const findMany = t.mock.fn(async () => []);
    stub(t, prisma.project, "findMany", findMany);
    await listFieldProjects({ ...ctx });
    assert.deepEqual(findMany.mock.calls[0]!.arguments, [{
      where: { tenantId: ctx.tenantId, status: { not: "CANCELLED" }, id: { in: [assignedId] } },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { code: "asc" }, take: 100,
    }]);
  });

  it("registration queries all assigned active works with an enabled action even if Projects is disabled", async (t) => {
    setup(t);
    prisma.tenantModuleSetting.findMany = (async () => [{ moduleKey: "PROJECTS", isEnabled: false }]) as unknown as typeof prisma.tenantModuleSetting.findMany;
    const findMany = t.mock.fn(async () => []);
    stub(t, prisma.project, "findMany", findMany);
    await listFieldProjects(ctx, { registration: true });
    assert.deepEqual(findMany.mock.calls[0]!.arguments, [{
      where: { tenantId: ctx.tenantId, status: "ACTIVE", id: { in: [assignedId] } },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { code: "asc" },
    }]);
  });

  it("registration does not list projects for a view-only actor", async (t) => {
    setup(t);
    const unexpected = () => { assert.fail("read-only actor queried registration projects"); };
    stub(t, prisma.project, "findMany", unexpected);
    assert.deepEqual(await listFieldProjects({ ...ctx, roles: ["VIEWER"] }, { registration: true }), []);
  });

  it("stale preferred project cannot override membership or select its schedule", async (t) => {
    setup(t);
    stub(t, prisma.project, "findMany", async () => []);
    const preferredLookup = t.mock.fn(async ({ where }: { where: Record<string, unknown> }) => {
      assert.equal(where.id, unassignedId);
      assert.deepEqual(where.AND, [{ id: { in: [assignedId] } }]);
      return null;
    });
    const schedule = t.mock.fn(async () => []);
    stub(t, prisma.project, "findFirst", preferredLookup);
    stub(t, prisma.scheduleItem, "findMany", schedule);
    const home = await getFieldHome({ ...ctx }, { preferredProjectId: unassignedId, pendingCounts });
    assert.equal(home.featuredProject, null);
    assert.deepEqual(home.todayItems, []);
    assert.equal(schedule.mock.callCount(), 0);
  });

  it("saving preferred project rejects absent membership", async (t) => {
    setup(t);
    stub(t, prisma.project, "findUnique", async () => ({
      id: unassignedId, tenantId: ctx.tenantId, companyId: ctx.companyId, status: "ACTIVE", country: "AR",
    }));
    stub(t, prisma.projectMembership, "findUnique", async () => null);
    await assert.rejects(() => assertPreferredProjectAccess(unassignedId, { ...ctx }),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
  });

  it("saving preferred project rejects another company even for OWNER", async (t) => {
    setup(t);
    stub(t, prisma.project, "findUnique", async () => ({
      id: assignedId, tenantId: ctx.tenantId, companyId: "other-company", status: "ACTIVE", country: "AR",
    }));
    await assert.rejects(() => assertPreferredProjectAccess(assignedId, { ...ctx, roles: ["OWNER"] }),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
  });

  it("pending list and badge queries apply company plus project scope to every source", async (t) => {
    setup(t);
    stub(t, prisma.project, "findMany", async () => [{ id: assignedId }]);
    const lookups: Record<string, unknown>[] = [];
    const list = async ({ where }: { where: Record<string, unknown> }) => {
      lookups.push(where);
      return [];
    };
    const count = async ({ where }: { where: Record<string, unknown> }) => {
      lookups.push(where);
      return 0;
    };
    for (const delegate of [prisma.purchaseRequest, prisma.purchaseOrder, prisma.jobsiteLog,
      prisma.certification, prisma.subcontractCertification]) {
      stub(t, delegate, "findMany", list);
      stub(t, delegate, "count", count);
    }
    const result = await getMyFieldPendingItems({ ...ctx, roles: ["OWNER"] });
    assert.equal(result.counts.total, 0);
    assert.equal(lookups.length, 16, "all eight list/count sources exercised");
    for (const where of lookups) {
      assert.equal(where.tenantId, ctx.tenantId);
      assert.deepEqual(where.projectId, { in: [assignedId] });
      if (where.OR) {
        assert.deepEqual(where.OR, [{ companyId: ctx.companyId }, { companyId: null }]);
      } else {
        assert.equal(where.companyId, ctx.companyId);
      }
    }
    assert.equal(lookups.filter((where) => where.OR).length, 2, "only nullable Certification keeps shared rows");
  });

  it("module-off pending sources perform no operational queries", async (t) => {
    setup(t);
    // Replace this test's default module stub directly; its original is restored by setup.
    prisma.tenantModuleSetting.findMany = (async () => ["PROCUREMENT", "JOBSITE_LOG", "CERTIFICATIONS", "SUBCONTRACTS"]
      .map((moduleKey) => ({ moduleKey, isEnabled: false }))) as unknown as typeof prisma.tenantModuleSetting.findMany;
    stub(t, prisma.project, "findMany", async () => [{ id: assignedId }]);
    const unexpected = () => { assert.fail("disabled module was queried"); };
    for (const delegate of [prisma.purchaseRequest, prisma.purchaseOrder, prisma.jobsiteLog,
      prisma.certification, prisma.subcontractCertification]) {
      stub(t, delegate, "findMany", unexpected);
      stub(t, delegate, "count", unexpected);
    }
    const result = await getMyFieldPendingItems({ ...ctx, roles: ["OWNER"] });
    assert.equal(result.counts.total, 0);
    assert.deepEqual(result.items, []);
  });

  it("Field home hides disabled project uploads while retaining independent operational actions", async (t) => {
    setup(t);
    prisma.tenantModuleSetting.findMany = (async () => [{ moduleKey: "PROJECTS", isEnabled: false }]) as unknown as typeof prisma.tenantModuleSetting.findMany;
    const unexpected = () => { assert.fail("disabled project overview was queried"); };
    stub(t, prisma.project, "findMany", unexpected);
    stub(t, prisma.scheduleItem, "findMany", unexpected);
    const home = await getFieldHome({ ...ctx, roles: ["OWNER"] }, { pendingCounts });
    assert.equal(home.actions.document, false);
    assert.equal(home.actions.jobsiteLog, true);
    assert.equal(home.actions.purchaseRequest, true);
    assert.equal(home.actions.consumption, true);
    assert.deepEqual(home.projects, []);
  });
});
