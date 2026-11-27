import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { prisma } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { updateTenantNotificationEmailPolicy } from "./notification-email-preference.service";

const ctx: ServiceContext = { tenantId: "tenant-policy", companyId: null, actorUserId: "owner", roles: ["OWNER"] };

function fixture(t: TestContext, currentHour: number | null, timezone = "America/Argentina/Buenos_Aires") {
  let update: Record<string, unknown> | undefined;
  function stub(delegate: object, method: string, replacement: unknown) {
    const target = delegate as Record<string, unknown>;
    const original = target[method];
    target[method] = replacement;
    t.after(() => { target[method] = original; });
  }
  stub(prisma.tenantModuleSetting, "findMany", async () => []);
  stub(prisma.tenant, "findFirst", async ({ where }: { where: { id: string } }) => {
    assert.equal(where.id, ctx.tenantId);
    return { timezone };
  });
  stub(prisma.tenantNotificationEmailPolicy, "findUnique", async ({ where }: { where: { tenantId: string } }) => {
    assert.equal(where.tenantId, ctx.tenantId);
    return currentHour === null ? null : { digestHourLocal: currentHour };
  });
  stub(prisma.tenantNotificationEmailPolicy, "upsert", async (args: {
    where: { tenantId: string }; update: Record<string, unknown>;
  }) => {
    assert.equal(args.where.tenantId, ctx.tenantId);
    update = args.update;
    return { tenantId: ctx.tenantId, leadershipDailyFlowEmailCc: false, digestEnabledDefault: true, digestHourLocal: currentHour ?? 7, ...args.update };
  });
  return { written: () => update };
}

it("rejects a new incompatible digest hour before persistence", async (t) => {
  const f = fixture(t, 7);
  await assert.rejects(updateTenantNotificationEmailPolicy({ digestHourLocal: 9 }, ctx), { code: "VALIDATION" });
  assert.equal(f.written(), undefined);
});

it("accepts a compatible change within the current tenant", async (t) => {
  const f = fixture(t, 7);
  await updateTenantNotificationEmailPolicy({ digestHourLocal: 4 }, ctx);
  assert.deepEqual(f.written(), { digestHourLocal: 4 });
});

it("preserves a legacy incompatible hour while updating other preferences", async (t) => {
  const f = fixture(t, 9);
  await updateTenantNotificationEmailPolicy({ digestHourLocal: 9, digestEnabledDefault: false }, ctx);
  assert.deepEqual(f.written(), { digestEnabledDefault: false });
});

it("does not reset an existing hour when an unrelated preference omits it", async (t) => {
  const f = fixture(t, 9);
  await updateTenantNotificationEmailPolicy({ leadershipDailyFlowEmailCc: true }, ctx);
  assert.deepEqual(f.written(), { leadershipDailyFlowEmailCc: true });
});

it("validates first explicit configuration and applies the organization's timezone", async (t) => {
  const f = fixture(t, null, "Pacific/Honolulu");
  await assert.rejects(updateTenantNotificationEmailPolicy({ digestHourLocal: 7 }, ctx), { code: "VALIDATION" });
  assert.equal(f.written(), undefined);
  await updateTenantNotificationEmailPolicy({ digestHourLocal: 0 }, ctx);
  assert.deepEqual(f.written(), { digestHourLocal: 0 });
});

it("keeps role authorization and integer validation before writes", async (t) => {
  const f = fixture(t, 7);
  await assert.rejects(updateTenantNotificationEmailPolicy({ digestHourLocal: 4 }, { ...ctx, roles: ["PROJECT_VIEWER"] }), { code: "FORBIDDEN" });
  for (const hour of [-1, 24, 4.5, NaN]) {
    await assert.rejects(updateTenantNotificationEmailPolicy({ digestHourLocal: hour }, ctx), { code: "VALIDATION" });
  }
  assert.equal(f.written(), undefined);
});
