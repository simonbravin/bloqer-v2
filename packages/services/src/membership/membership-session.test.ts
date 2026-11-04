import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { prisma } from "@bloqer/database";
import { getSessionTenantContext } from "./membership.service";

const actorId = randomUUID();
const tenantId = randomUUID();
const companyId = randomUUID();
const otherTenantId = randomUUID();

function membership(tenant = tenantId, company: string | null = companyId) {
  return { tenantId: tenant, companyId: company, roles: ["PROJECT_MANAGER"], status: "ACTIVE", tenant: { name: tenant, status: "ACTIVE" } };
}

function stub(t: TestContext, rows: ReturnType<typeof membership>[], validCompany = true, soleIds: string[] = []) {
  const memberships = { findMany: prisma.userMembership.findMany, findUnique: prisma.userMembership.findUnique };
  const tenant = { findUnique: prisma.tenant.findUnique };
  const companies = { findFirst: prisma.company.findFirst, findMany: prisma.company.findMany };
  t.after(() => {
    Object.assign(prisma.userMembership, memberships);
    Object.assign(prisma.tenant, tenant);
    Object.assign(prisma.company, companies);
  });
  Object.assign(prisma.userMembership, { findMany: async () => rows, findUnique: async () => rows[0] ?? null });
  Object.assign(prisma.tenant, { findUnique: async () => ({ name: tenantId, status: "ACTIVE" }) });
  Object.assign(prisma.company, {
    findFirst: async () => validCompany ? { id: companyId } : null,
    findMany: async () => soleIds.map((id) => ({ id })),
  });
}

test("an active explicit company retains the anchored session scope and DB roles", async (t) => {
  stub(t, [membership()]);
  assert.deepEqual(await getSessionTenantContext(actorId), {
    tenantId, tenantName: tenantId, companyId, roles: ["PROJECT_MANAGER"],
  });
});

test("a missing, inactive or foreign company cannot become a global tenant session", async (t) => {
  stub(t, [membership()], false, [randomUUID()]);
  assert.equal(await getSessionTenantContext(actorId), null);
  assert.equal(await getSessionTenantContext(actorId, { preferredTenantId: tenantId }), null);
});

test("an invalid preferred membership can fall back to another valid workspace", async (t) => {
  stub(t, [membership(), membership(otherTenantId, null)], false);
  const ctx = await getSessionTenantContext(actorId, { preferredTenantId: tenantId });
  assert.equal(ctx?.tenantId, otherTenantId);
  assert.equal(ctx?.companyId, null);
});

test("D-092 sole-company fallback applies only to an originally global membership", async (t) => {
  stub(t, [membership(tenantId, null)], true, [companyId]);
  assert.equal((await getSessionTenantContext(actorId))?.companyId, companyId);
});

test("zero or multiple active companies preserve a genuinely global membership", async (t) => {
  const ids: string[] = [];
  stub(t, [membership(tenantId, null)], true, ids);
  assert.equal((await getSessionTenantContext(actorId))?.companyId, null);
  ids.push(companyId, randomUUID());
  assert.equal((await getSessionTenantContext(actorId))?.companyId, null);
});

test("no active membership produces no tenant context", async (t) => {
  stub(t, []);
  assert.equal(await getSessionTenantContext(actorId), null);
});

test("an active membership without roles cannot become a tenant session", async (t) => {
  const row = membership();
  row.roles = [];
  stub(t, [row]);
  assert.equal(await getSessionTenantContext(actorId, { preferredTenantId: tenantId }), null);
});
