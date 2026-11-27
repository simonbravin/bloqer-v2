import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";

const require = createRequire(import.meta.url);
const { prisma } = require("@bloqer/database") as typeof import("@bloqer/database");
const {
  runScheduledReportsForAllActiveTenants,
  runScheduledReportsForTenant,
} = require("./scheduled-report-cron.service") as typeof import("./scheduled-report-cron.service");
const { PartialScheduledAttachmentsError } = require("./scheduled-report-attachment.service") as
  typeof import("./scheduled-report-attachment.service");

function mockQuery(
  t: TestContext,
  target: object,
  method: string,
  implementation: (args: unknown) => unknown,
) {
  const delegate = target as Record<string, unknown>;
  const original = delegate[method];
  delegate[method] = async (args: unknown) => implementation(args);
  t.after(() => { delegate[method] = original; });
}

const noAttachment = async () => assert.fail("this run must not build or send attachments");

test("a scheduled-report query failure is reported as a failed cron result", async (t) => {
  t.mock.method(console, "error", () => undefined);
  mockQuery(t, prisma.tenant, "findFirst", () => ({ id: "tenant" }));
  mockQuery(t, prisma.scheduledReport, "findMany", () => {
    throw new Error("fixture schedule query failure");
  });

  const result = await runScheduledReportsForTenant("tenant", noAttachment);

  assert.equal(result.ok, false);
  assert.equal(result.totals.failed, 1);
  assert.equal(result.tenants[0]?.ok, false);
});

test("one tenant lookup failure does not prevent the next tenant from running", async (t) => {
  t.mock.method(console, "error", () => undefined);
  mockQuery(t, prisma.tenant, "findMany", () => [{ id: "failing" }, { id: "healthy" }]);
  mockQuery(t, prisma.tenant, "findFirst", (args) => {
    const { where } = args as { where: { id: string } };
    if (where.id === "failing") throw new Error("fixture tenant lookup failure");
    return { id: where.id };
  });
  const executed: string[] = [];
  mockQuery(t, prisma.scheduledReport, "findMany", (args) => {
    const { where } = args as { where: { tenantId: string } };
    executed.push(where.tenantId);
    return [];
  });

  const result = await runScheduledReportsForAllActiveTenants(noAttachment);

  assert.deepEqual(executed, ["healthy"]);
  assert.equal(result.ok, false);
  assert.equal(result.tenantsProcessed, 2);
  assert.equal(result.totals.failed, 1);
  assert.deepEqual(result.tenants.map(({ tenantId, ok }) => ({ tenantId, ok })), [
    { tenantId: "failing", ok: false },
    { tenantId: "healthy", ok: true },
  ]);
});

test("a schedule execution failure is visible in tenant and aggregate cron results", async (t) => {
  mockQuery(t, prisma.tenant, "findMany", () => [{ id: "tenant" }]);
  mockQuery(t, prisma.tenant, "findFirst", () => ({ id: "tenant" }));
  mockQuery(t, prisma.scheduledReport, "findMany", () => [{ id: "schedule", tenantId: "tenant" }]);
  mockQuery(t, prisma.scheduledReport, "updateMany", () => {
    throw new Error("fixture schedule lock failure");
  });

  const result = await runScheduledReportsForAllActiveTenants(noAttachment);

  assert.equal(result.ok, false);
  assert.equal(result.tenants[0]?.ok, false);
  assert.equal(result.totals.schedulesProcessed, 1);
  assert.equal(result.totals.failed, 1);
});

test("an inactive tenant is skipped without reporting a failure or querying schedules", async (t) => {
  mockQuery(t, prisma.tenant, "findFirst", () => null);
  mockQuery(t, prisma.scheduledReport, "findMany", () => assert.fail("inactive tenant must not run"));

  const result = await runScheduledReportsForTenant("inactive", noAttachment);

  assert.equal(result.ok, true);
  assert.equal(result.tenantsProcessed, 0);
  assert.equal(result.totals.failed, 0);
  assert.deepEqual(result.tenants, []);
});

test("attachment errors in a partial report fail the cron even without a rejected recipient", async (t) => {
  mockQuery(t, prisma.tenant, "findFirst", () => ({ id: "tenant", name: "Test" }));
  mockQuery(t, prisma.tenantModuleSetting, "findMany", () => []);
  mockQuery(t, prisma.userMembership, "findUnique", () => null);
  mockQuery(t, prisma.company, "findFirst", () => null);
  mockQuery(t, prisma.emailDeliveryLog, "create", () => ({ id: "skipped-log" }));
  mockQuery(t, prisma.scheduledReport, "findMany", () => [{
    id: "schedule", tenantId: "tenant", companyId: null, projectId: null,
    name: "Parte diario", status: "ACTIVE", format: "PDF", frequency: "DAILY",
    timeOfDay: "07:00", timezone: "America/Argentina/Buenos_Aires",
    dayOfWeek: null, dayOfMonth: null, params: null,
    nextRunAt: new Date("2026-10-01T10:00:00.000Z"),
    updatedAt: new Date("2026-09-30T10:00:00.000Z"),
    items: [{ reportKey: "TENANT_JOBSITE_DAILY_LOGS", sortOrder: 0 }],
    recipients: [{ recipientUserId: "recipient", recipient: { email: "recipient@example.com" } }],
  }]);
  let finalStatus: unknown;
  mockQuery(t, prisma.scheduledReport, "updateMany", (args) => {
    const { data } = args as { data: { lastRunStatus?: unknown } };
    if (data.lastRunStatus) finalStatus = data.lastRunStatus;
    return { count: 1 };
  });
  t.mock.method(globalThis, "fetch", async () => assert.fail("must not send email"));

  const result = await runScheduledReportsForTenant("tenant", async () => {
    throw new PartialScheduledAttachmentsError([{
      filename: "parte.pdf", content: Buffer.from("fixture"), contentType: "application/pdf",
      reportKey: "TENANT_JOBSITE_DAILY_LOGS",
    }], ["fixture failed attachment"]);
  });

  assert.equal(finalStatus, "PARTIAL");
  assert.equal(result.totals.failed, 0);
  assert.equal(result.totals.skipped, 1);
  assert.equal(result.tenants[0]?.ok, false);
  assert.equal(result.ok, false);
});

test("a report claimed by another runner is counted as locked without a cron failure", async (t) => {
  mockQuery(t, prisma.tenant, "findFirst", () => ({ id: "tenant" }));
  mockQuery(t, prisma.scheduledReport, "findMany", () => [{ id: "schedule", tenantId: "tenant" }]);
  mockQuery(t, prisma.scheduledReport, "updateMany", () => ({ count: 0 }));

  const result = await runScheduledReportsForTenant("tenant", noAttachment);

  assert.equal(result.ok, true);
  assert.equal(result.totals.locked, 1);
  assert.equal(result.totals.failed, 0);
});
