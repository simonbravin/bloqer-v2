import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";
import { listEmailDeliveryLogs } from "../email-delivery/email-delivery-log.service";
import { clearProjectAccessModeCache } from "../security/access";
import type { ServiceContext } from "../types";
import { runNotificationDigestForTenant } from "./notification-digest.service";
import { sendNotificationEmail } from "./notification-email.service";
import { createOperationalNotificationOnce } from "./notification.service";
import { runOperationalAlert } from "./operational-alerts-runner.service";

const ctx: ServiceContext = {
  tenantId: "tenant", companyId: "company", actorUserId: "admin", roles: ["ADMIN"],
};

function stub(t: TestContext, delegate: object, method: string, replacement: unknown) {
  const target = delegate as Record<string, unknown>;
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
}

test("digest resolves current company and critical notification scope before sending", async (t) => {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  stub(t, prisma.tenant, "findFirst", async () => ({ id: "tenant", name: "Fixture", timezone: "America/Argentina/Buenos_Aires" }));
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  stub(t, prisma.tenantNotificationEmailPolicy, "upsert", async () => ({
    tenantId: "tenant", leadershipDailyFlowEmailCc: false, digestEnabledDefault: true, digestHourLocal: 7,
  }));
  const user = { email: "admin@example.test", name: "Synthetic Admin" };
  stub(t, prisma.userMembership, "findMany", async ({ where }: { where: Record<string, unknown> }) => {
    assert.deepEqual(where.user, { status: "ACTIVE" });
    assert.deepEqual(where.OR, [{ companyId: null }, { company: { tenantId: "tenant", status: "ACTIVE" } }]);
    return [{ userId: "admin", companyId: null, roles: ["ADMIN"], user }];
  });
  stub(t, prisma.userMembership, "findFirst", async () => ({ companyId: null, roles: ["ADMIN"], user }));
  stub(t, prisma.company, "findMany", async () => [{ id: "company" }]);
  stub(t, prisma.userNotificationEmailPreference, "findUnique", async () => null);
  stub(t, prisma.tenantModuleSetting, "findMany", async () =>
    ["PROCUREMENT", "PURCHASE_REQUESTS", "PURCHASE_ORDERS", "JOBSITE_LOG", "CERTIFICATIONS", "SUBCONTRACTS"].map(
      (moduleKey) => ({ moduleKey, isEnabled: false }),
    ));
  stub(t, prisma.project, "findMany", async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { tenantId: "tenant", OR: [{ companyId: "company" }, { companyId: null }] });
    return [{ id: "allowed-project" }];
  });
  stub(t, prisma.notification, "count", async ({ where }: { where: Record<string, unknown> }) => {
    assert.deepEqual(where.AND, [
      { OR: [{ companyId: "company" }, { companyId: null }] },
      { OR: [{ projectId: null }, { projectId: { in: ["allowed-project"] } }] },
    ]);
    assert.equal(where.recipientUserId, "admin");
    assert.ok(where.type);
    return 2;
  });
  stub(t, prisma.emailDeliveryLog, "findMany", async () => []);
  stub(t, prisma.emailDeliveryLog, "create", async ({ data }: { data: Record<string, unknown> }) => {
    assert.equal(data.companyId, "company");
    assert.equal(data.idempotencyKey, "notification-digest:tenant:admin:2026-11-05");
    return { id: "digest-log" };
  });
  stub(t, prisma.emailDeliveryLog, "findFirst", async () => ({ id: "digest-log", status: "PENDING" }));
  stub(t, prisma.emailDeliveryLog, "update", async () => ({ id: "digest-log" }));
  stub(t, prisma.emailDeliveryLog, "updateMany", async () => ({ count: 1 }));
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("idempotency-key"), "notification-digest:tenant:admin:2026-11-05");
    return Response.json({ id: "simulated-confirmation" });
  });
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = "fixture-only";
  process.env.RESEND_FROM_EMAIL = "fixture@example.test";
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = oldFrom;
  });
  const result = await runNotificationDigestForTenant("tenant", new Date("2026-11-05T10:05:00.000Z"));
  assert.deepEqual(result, { tenantId: "tenant", ok: true, sent: 1, skipped: 0, errors: 0 });
});

test("an anchored admin cannot dispatch a foreign-company notification by id", async (t) => {
  stub(t, prisma.notification, "findFirst", async () => ({
    id: "notification", tenantId: "tenant", companyId: "other-company", recipientUserId: "recipient",
    status: "UNREAD", type: "PAYABLE_OVERDUE",
  }));
  stub(t, prisma.userMembership, "findFirst", async () => assert.fail("must authorize before resolving recipient"));
  await assert.rejects(sendNotificationEmail("notification", ctx), /No podés enviar/);
});

test("email history applies company scope even when filtering a non-scheduled delivery", async (t) => {
  stub(t, prisma.userMembership, "findMany", async () => [{ userId: "own-user" }]);
  stub(t, prisma.emailDeliveryLog, "findMany", async ({ where }: { where: Record<string, unknown> }) => {
    assert.deepEqual(where, {
      tenantId: "tenant",
      emailType: "NOTIFICATION",
      OR: [{ companyId: "company" }, { companyId: null, recipientUserId: { in: ["own-user"] } }],
    });
    return [];
  });
  assert.deepEqual(await listEmailDeliveryLogs({ emailType: "NOTIFICATION" }, ctx), []);
});

test("manual operational alerts cannot enumerate or mutate the finance source when the gate is disabled", async (t) => {
  stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "AP", isEnabled: false }]);
  stub(t, prisma.payable, "findMany", async () => assert.fail("AP must remain untouched"));
  const result = await runOperationalAlert("overduePayables", ctx);
  assert.deepEqual(result, { alertType: "overduePayables", checkedCount: 0, createdCount: 0, skippedCount: 0, errors: [] });
});

test("operational alert reserves the rolling dedupe key and checks history in the same transaction", async (t) => {
  const order: string[] = [];
  const db = {
    $executeRaw: async ({ sql, values }: { sql: string; values: unknown[] }) => {
      assert.match(sql, /pg_advisory_xact_lock/);
      assert.match(String(values[1]), /"recipientUserId":"recipient"/);
      order.push("lock");
    },
    notification: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.tenantId, "tenant");
        assert.equal(where.linkedEntityId, "invoice");
        assert.deepEqual(where.status, { not: "ARCHIVED" });
        order.push("query");
        return { id: "existing" };
      },
      create: async () => assert.fail("duplicate must not insert"),
    },
  };
  stub(t, prisma, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  assert.equal(await createOperationalNotificationOnce({
    tenantId: "tenant", recipientUserId: "recipient", linkedEntityId: "invoice",
    linkedEntityType: "SUPPLIER_INVOICE", type: "PAYABLE_OVERDUE", title: "Fixture", body: "Fixture",
  }), null);
  assert.deepEqual(order, ["lock", "query"]);
});
