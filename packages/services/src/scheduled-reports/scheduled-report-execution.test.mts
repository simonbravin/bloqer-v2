import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";

import type { ServiceContext } from "../types";
import type { BuildScheduledReportAttachmentFn } from "./scheduled-report-attachment.service";

const require = createRequire(import.meta.url);
const { prisma } = require("@bloqer/database") as typeof import("@bloqer/database");
const {
  assertReportKeyEnabledAtRun,
  buildScheduledReportsCronServiceContext,
  clearProjectAccessModeCache,
  deactivateScheduledReport,
  deliverScheduledReportBundle,
  PartialScheduledAttachmentsError,
  retryScheduledReportFailedDeliveries,
  runDueScheduledReportsForTenant,
  runScheduledReportNow,
  ServiceError,
} = require("../index") as typeof import("../index");

function mockQuery(
  t: TestContext,
  target: object,
  method: string,
  implementation: (args: unknown) => unknown,
) {
  const delegate = target as Record<string, unknown>;
  const original = delegate[method];
  delegate[method] = async (args: unknown) => implementation(args);
  t.after(() => {
    delegate[method] = original;
  });
}

const ownProjectId = "a0000000-0000-4000-8000-000000000001";
const otherProjectId = "a0000000-0000-4000-8000-000000000002";
const admin: ServiceContext = {
  tenantId: "tenant",
  companyId: "company",
  roles: ["ADMIN"],
  actorUserId: "admin",
};
const ownOrShared = [{ companyId: "company" }, { companyId: null }];

function activeRecipient(userId: string, companyId: string, roles: ServiceContext["roles"]) {
  return {
    status: "ACTIVE",
    companyId,
    company: { tenantId: "tenant", status: "ACTIVE" },
    roles,
    user: { email: `${userId}@example.com`, status: "ACTIVE" },
  };
}

function mockInactiveRecipientDeliveries(t: TestContext) {
  mockQuery(t, prisma.tenantModuleSetting, "findMany", () => []);
  mockQuery(t, prisma.userMembership, "findUnique", () => null);
  mockQuery(t, prisma.tenant, "findFirst", () => ({ name: "Test" }));
  mockQuery(t, prisma.company, "findFirst", () => null);
  mockQuery(t, prisma.emailDeliveryLog, "findFirst", () => null);
  mockQuery(t, prisma.emailDeliveryLog, "create", () => ({ id: "log" }));
}

function sharedDailySchedule(projectId: string) {
  return {
    id: "schedule",
    companyId: null,
    tenantId: "tenant",
    projectId: null,
    name: "Parte diario",
    status: "ACTIVE",
    format: "PDF",
    frequency: "DAILY",
    timeOfDay: "00:00",
    params: { jobsiteProjectIds: projectId },
    timezone: "America/Argentina/Buenos_Aires",
    nextRunAt: new Date("2026-10-01T03:00:00.000Z"),
    updatedAt: new Date("2026-09-30T03:00:00.000Z"),
    items: [{ reportKey: "TENANT_JOBSITE_DAILY_LOGS", sortOrder: 0 }],
    recipients: [{ recipientUserId: "recipient", recipient: { email: "recipient@example.com" } }],
  };
}

test("progress bundles skip recipients who no longer have active tenant membership", async (t) => {
  const ctx = buildScheduledReportsCronServiceContext("tenant", null);
  mockQuery(t, prisma.emailDeliveryLog, "findFirst", () => null);
  mockQuery(t, prisma.tenant, "findFirst", () => ({ name: "Test" }));
  mockQuery(t, prisma.userMembership, "findUnique", (args) => {
    assert.deepEqual((args as { where: unknown }).where, {
      userId_tenantId: { userId: "recipient", tenantId: "tenant" },
    });
    return { status: "INACTIVE" };
  });
  let skippedLogs = 0;
  mockQuery(t, prisma.emailDeliveryLog, "create", (args) => {
    const { data } = args as { data: Record<string, unknown> };
    assert.equal(data.status, "SKIPPED");
    assert.equal(data.skippedReason, "recipient_inactive");
    assert.equal(data.tenantId, ctx.tenantId);
    skippedLogs++;
    return { id: "log" };
  });

  for (const deliveryKind of ["scheduled", "manual", "retry"] as const) {
    const result = await deliverScheduledReportBundle(
      {
        scheduleId: "schedule",
        scheduleName: "Avances",
        runWindow: "2026-10-01T03:00:00.000Z",
        runId: "run",
        recipientUserId: "recipient",
        recipientEmail: "recipient@example.com",
        recipientAccess: { companyId: null, roles: ["OWNER"], email: "recipient@example.com" },
        generatedWithModules: new Set(),
        attachments: [
          {
            filename: "avances.csv",
            content: Buffer.from("dummy"),
            contentType: "text/csv",
            reportKey: "PROJECT_PROGRESS",
          },
        ],
        deliveryKind,
      },
      ctx,
    );
    assert.deepEqual(result, { outcome: "skipped", reason: "recipient_inactive" });
  }

  assert.equal(skippedLogs, 3);
});

test("manual run and retry look up schedules with the actor's company and project scope", async (t) => {
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", (args) => {
    const { where } = args as { where: unknown };
    assert.deepEqual(where, {
      id: "foreign-schedule",
      tenantId: "tenant",
      OR: ownOrShared,
      AND: [
        {
          OR: [
            { projectId: null },
            { project: { tenantId: "tenant", OR: ownOrShared, id: { in: [ownProjectId] } } },
          ],
        },
      ],
    });
    return null;
  });
  mockQuery(t, prisma.emailDeliveryLog, "findMany", () =>
    assert.fail("must authorize schedule before accessing email logs"),
  );
  mockQuery(t, prisma.scheduledReport, "updateMany", () =>
    assert.fail("must authorize schedule before locking"),
  );

  for (const run of [runScheduledReportNow, retryScheduledReportFailedDeliveries]) {
    await assert.rejects(
      () =>
        run({ ...admin }, "foreign-schedule", async () =>
          assert.fail("must not build attachments"),
        ),
      (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND",
    );
  }
});

test("manual run and retry reject an inaccessible daily project even when the schedule is shared", async (t) => {
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.scheduledReport, "findFirst", () => sharedDailySchedule(otherProjectId));
  mockQuery(t, prisma.project, "findMany", (args) => {
    const { where } = args as { where: { status?: string } };
    if (!where.status) return [{ id: ownProjectId }];
    assert.deepEqual(where, {
      tenantId: "tenant",
      status: "ACTIVE",
      OR: ownOrShared,
      AND: [{ id: { in: [otherProjectId] } }, { id: { in: [ownProjectId] } }],
    });
    return [];
  });
  mockQuery(t, prisma.emailDeliveryLog, "findMany", () =>
    assert.fail("must authorize daily projects before accessing email logs"),
  );
  mockQuery(t, prisma.scheduledReport, "updateMany", () =>
    assert.fail("must authorize daily projects before locking"),
  );

  for (const run of [runScheduledReportNow, retryScheduledReportFailedDeliveries]) {
    await assert.rejects(
      () => run({ ...admin }, "schedule", async () => assert.fail("must not build attachments")),
      (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION",
    );
  }
});

test("manual run of a shared schedule builds attachments with the actor's actual company", async (t) => {
  const row = sharedDailySchedule(ownProjectId);
  mockInactiveRecipientDeliveries(t);
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => row);
  mockQuery(t, prisma.scheduledReport, "updateMany", (args) => {
    const { data } = args as { data: Record<string, unknown> };
    assert.ok(!Object.hasOwn(data, "companyId"));
    assert.ok(!Object.hasOwn(data, "nextRunAt"));
    return { count: 1 };
  });

  let built = 0;
  const result = await runScheduledReportNow(
    { ...admin },
    "schedule",
    async (key, format, projectId, params, ctx) => {
      assert.equal(key, "TENANT_JOBSITE_DAILY_LOGS");
      assert.equal(format, "PDF");
      assert.equal(projectId, null);
      assert.equal(params?.jobsiteProjectIds, ownProjectId);
      assert.match(params?.runLogDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(ctx, admin);
      built++;
      return [];
    },
  );

  assert.equal(built, 1);
  assert.equal(result.runStatus, "SKIPPED");
});

test("retry searches only failed deliveries visible to the company operating the schedule", async (t) => {
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => sharedDailySchedule(ownProjectId));
  mockQuery(t, prisma.userMembership, "findMany", () => [{ userId: "recipient" }]);
  mockQuery(t, prisma.emailDeliveryLog, "findMany", (args) => {
    const { where } = args as { where: { OR: unknown; status: unknown; recipientUserId: unknown } };
    assert.deepEqual(where.status, { in: ["FAILED", "SENT"] });
    assert.deepEqual(where.recipientUserId, { in: ["recipient"] });
    assert.deepEqual(where.OR, [
      { companyId: "company" },
      { companyId: null, recipientUserId: { in: ["recipient"] } },
    ]);
    return [];
  });

  await assert.rejects(
    () =>
      retryScheduledReportFailedDeliveries({ ...admin }, "schedule", async () =>
        assert.fail("must not build attachments"),
      ),
    (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION",
  );
});

test("a runner that loses its lock cannot finalize or release a successor's lease", async (t) => {
  const row = sharedDailySchedule(ownProjectId);
  mockInactiveRecipientDeliveries(t);
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => row);
  let lockUntil: Date | undefined;
  let writes = 0;
  mockQuery(t, prisma.scheduledReport, "updateMany", (args) => {
    const { where, data } = args as { where: Record<string, unknown>; data: Record<string, unknown> };
    writes++;
    if (writes === 1) {
      assert.ok(data.runLockUntil instanceof Date);
      lockUntil = data.runLockUntil;
      return { count: 1 };
    }
    if (writes === 2) {
      assert.deepEqual((where.runLockUntil as { equals: Date }).equals, lockUntil);
      assert.equal(data.lastRunStatus, "SKIPPED");
    } else {
      assert.equal(where.runLockUntil, lockUntil);
      assert.deepEqual(data, { runLockUntil: null });
    }
    return { count: 0 };
  });

  await assert.rejects(
    () => runScheduledReportNow({ ...admin }, "schedule", async () => []),
    /perdió el bloqueo/,
  );
  assert.equal(writes, 3);
});

test("pause refuses a configuration locked for an in-progress delivery", async (t) => {
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => ({
    ...sharedDailySchedule(ownProjectId),
    companyId: "company",
    runLockUntil: new Date(Date.now() + 60_000),
  }));
  mockQuery(t, prisma.scheduledReport, "updateMany", () =>
    assert.fail("must not mutate a configuration with an active lease"),
  );
  await assert.rejects(() => deactivateScheduledReport({ ...admin }, "schedule"), /ejecución en curso/);
});

test("retry builds each original daily slot and excludes delivered and untraceable attempts", async (t) => {
  mockInactiveRecipientDeliveries(t);
  const recipients = ["one", "two", "done", "legacy"];
  const row = {
    ...sharedDailySchedule(ownProjectId),
    recipients: recipients.map((id) => ({
      recipientUserId: id,
      recipient: { email: `${id}@example.test` },
    })),
  };
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => row);
  mockQuery(t, prisma.scheduledReport, "updateMany", () => ({ count: 1 }));
  mockQuery(t, prisma.userMembership, "findMany", () => recipients.map((userId) => ({ userId })));
  const delivery = (recipientUserId: string, status: "SENT" | "FAILED", runWindow: string) =>
    ({ recipientUserId, status, metadata: { runWindow } });
  const first = "2026-11-01T03:00:00.000Z";
  const second = "manual:2026-11-02T03:00:00.000Z";
  mockQuery(t, prisma.emailDeliveryLog, "findMany", () => [
    delivery("one", "FAILED", first),
    delivery("two", "FAILED", second),
    delivery("done", "FAILED", "2026-11-03T03:00:00.000Z"),
    delivery("done", "SENT", "2026-11-03T03:00:00.000Z"),
    delivery("legacy", "FAILED", "retry:2026-11-04T03:00:00.000Z"),
  ]);
  const dates: Array<string | undefined> = [];
  const summary = await retryScheduledReportFailedDeliveries(
    { ...admin },
    "schedule",
    async (_key, _format, _projectId, params) => {
      dates.push(params?.runLogDate);
      return [];
    },
  );
  assert.deepEqual(dates, ["2026-11-01", "2026-11-02"]);
  assert.equal(summary.runStatus, "SKIPPED");
});

test("a configuration edit after loading the schedule blocks a stale run before attachment generation", async (t) => {
  const row = sharedDailySchedule(ownProjectId);
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => row);
  mockQuery(t, prisma.scheduledReport, "updateMany", (args) => {
    const { where } = args as { where: { updatedAt: Date } };
    assert.deepEqual(where.updatedAt, row.updatedAt);
    return { count: 0 }; // The stored updatedAt no longer matches the loaded snapshot.
  });

  await assert.rejects(
    () =>
      runScheduledReportNow({ ...admin }, "schedule", async () =>
        assert.fail("must not build stale attachments"),
      ),
    (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT",
  );
});

test("a global daily run sends each company and project member only their authorized part PDFs", async (t) => {
  clearProjectAccessModeCache();
  const row = {
    ...sharedDailySchedule(ownProjectId),
    recipients: ["own", "other", "unassigned", "no-permission"].map((id) => ({
      recipientUserId: id,
      recipient: { email: `${id}@example.com` },
    })),
  };
  const members = [
    { userId: "own", companyId: "company", roles: ["SITE_FOREMAN"] },
    { userId: "other", companyId: "other-company", roles: ["SITE_FOREMAN"] },
    { userId: "unassigned", companyId: "company", roles: ["PROJECT_VIEWER"] },
    { userId: "no-permission", companyId: "company", roles: [] },
  ];
  mockQuery(t, prisma.scheduledReport, "findMany", () => [row]);
  mockQuery(t, prisma.scheduledReport, "updateMany", () => ({ count: 1 }));
  mockQuery(t, prisma.scheduledReport, "update", () => row);
  let jobsiteGateDisabled = false;
  mockQuery(t, prisma.tenantModuleSetting, "findMany", () =>
    jobsiteGateDisabled ? [{ moduleKey: "JOBSITE_LOG", isEnabled: false }] : [],
  );
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  mockQuery(t, prisma.tenant, "findFirst", () => ({ name: "Test" }));
  let scopeReads = 0;
  mockQuery(t, prisma.project, "findUnique", () => {
    scopeReads++;
    return { id: ownProjectId, tenantId: "tenant", companyId: null, status: "ACTIVE" };
  });
  mockQuery(t, prisma.userMembership, "findMany", () => members);
  mockQuery(t, prisma.userMembership, "findUnique", (args) => {
    const { userId } = (args as { where: { userId_tenantId: { userId: string } } }).where.userId_tenantId;
    const member = members.find((value) => value.userId === userId);
    return member ? activeRecipient(member.userId, member.companyId, member.roles as ServiceContext["roles"]) : null;
  });
  let ownAssignmentRevoked = false;
  mockQuery(t, prisma.projectMembership, "findMany", () =>
    ["own", "other", "no-permission"].filter((id) => id !== "own" || !ownAssignmentRevoked)
      .map((userId) => ({ userId })),
  );
  mockQuery(t, prisma.emailDeliveryLog, "findFirst", (args) => {
    const { where } = args as { where: { status?: string } };
    return where.status === "SENT" ? null : { id: "log" };
  });
  mockQuery(t, prisma.emailDeliveryLog, "update", () => ({ id: "log" }));
  const logs = new Map<
    string,
    { status: string; skippedReason?: string; metadata: { attachmentCount: number } }
  >();
  mockQuery(t, prisma.emailDeliveryLog, "create", (args) => {
    const { data } = args as {
      data: {
        recipientUserId: string;
        status: string;
        skippedReason?: string;
        metadata: { attachmentCount: number };
      };
    };
    logs.set(data.recipientUserId, data);
    return { id: "log" };
  });

  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = "fixture-only";
  process.env.RESEND_FROM_EMAIL = "reports@example.com";
  t.after(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = previousFrom;
  });
  const sent = new Map<string, string[]>();
  t.mock.method(
    globalThis,
    "fetch",
    async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      assert.match(String(url), /^https:\/\/api\.resend\.com\/emails$/);
      const body = JSON.parse(String(init?.body)) as {
        to: string;
        attachments: { filename: string }[];
      };
      sent.set(
        body.to,
        body.attachments.map(({ filename }) => filename),
      );
      return Response.json({ id: "simulated-send" });
    },
  );

  const part = (filename: string, companyId?: string) => ({
    filename,
    content: Buffer.from("fixture PDF"),
    contentType: "application/pdf",
    reportKey: "TENANT_JOBSITE_DAILY_LOGS" as const,
    ...(companyId ? { jobsiteScope: { projectId: ownProjectId, companyId } } : {}),
  });
  const runs = await runDueScheduledReportsForTenant("tenant", async () => {
    throw new PartialScheduledAttachmentsError(
      [
        part("a1.pdf", "company"),
        part("a2.pdf", "company"),
        part("b1.pdf", "other-company"),
        part("unscoped.pdf"),
      ],
      ["A PDF could not be rendered"],
    );
  });

  assert.equal(scopeReads, 6);
  assert.equal(runs[0]?.runStatus, "PARTIAL");
  assert.equal(runs[0]?.recipientsSent, 2);
  assert.equal(runs[0]?.recipientsSkipped, 2);
  assert.deepEqual(
    [...sent],
    [
      ["own@example.com", ["a1.pdf", "a2.pdf"]],
      ["other@example.com", ["b1.pdf"]],
    ],
  );
  assert.equal(logs.get("own")?.metadata.attachmentCount, 2);
  assert.equal(logs.get("other")?.metadata.attachmentCount, 1);
  for (const id of ["unassigned", "no-permission"]) {
    assert.equal(logs.get(id)?.status, "SKIPPED");
    assert.equal(logs.get(id)?.skippedReason, "no_authorized_attachments");
    assert.equal(logs.get(id)?.metadata.attachmentCount, 0);
  }
  sent.clear();
  const revoked = await runDueScheduledReportsForTenant("tenant", async () => {
    ownAssignmentRevoked = true;
    return [part("revoked.pdf", "company")];
  });
  assert.equal(revoked[0]?.runStatus, "SKIPPED");
  assert.equal(sent.size, 0);
  assert.equal(logs.get("own")?.skippedReason, "no_authorized_attachments");

  jobsiteGateDisabled = true;
  const unavailable = await runDueScheduledReportsForTenant("tenant", async (key, _format, _projectId, _params, ctx) => {
    await assertReportKeyEnabledAtRun(key, ctx);
    return assert.fail("the disabled report must not be built");
  });
  assert.equal(unavailable[0]?.runStatus, "SKIPPED");
  assert.equal(unavailable[0]?.recipientsSkipped, 4);
  assert.deepEqual(unavailable[0]?.attachmentErrors, []);
  assert.equal(sent.size, 0);
  clearProjectAccessModeCache();
});

test("D-140 scopes cron, Send now and Retry attachments to the active recipient's company, roles and project", async (t) => {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  const members = {
    full: activeRecipient("full", "company", ["OWNER"]),
    limited: activeRecipient("limited", "company", ["PROJECT_VIEWER"]),
    unassigned: activeRecipient("unassigned", "company", ["PROJECT_VIEWER"]),
    foreign: activeRecipient("foreign", "other-company", ["OWNER"]),
    disabled: { ...activeRecipient("disabled", "company", ["OWNER"]), user: { email: "disabled@example.com", status: "SUSPENDED" } },
  };
  const recipientIds = Object.keys(members);
  const row = {
    ...sharedDailySchedule(ownProjectId),
    companyId: "company",
    projectId: ownProjectId,
    format: "CSV",
    params: null,
    recipients: recipientIds.map((recipientUserId) => ({ recipientUserId, recipient: { email: "previous@example.com" } })),
    items: [
      { reportKey: "PROJECT_PROGRESS", sortOrder: 0 },
      { reportKey: "PROJECT_PROFITABILITY", sortOrder: 1 },
    ],
  };
  let selectedSchedule = { ...row, projectId: row.projectId as string | null };
  mockQuery(t, prisma.scheduledReport, "findMany", () => [selectedSchedule]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => selectedSchedule);
  mockQuery(t, prisma.scheduledReport, "updateMany", () => ({ count: 1 }));
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  mockQuery(t, prisma.tenant, "findFirst", () => ({ name: "Tenant fixture" }));
  let gateRevoked = false;
  mockQuery(t, prisma.tenantModuleSetting, "findMany", () =>
    gateRevoked ? [{ moduleKey: "AR", isEnabled: false }] : [],
  );
  mockQuery(t, prisma.company, "findFirst", () => ({ name: "Company fixture" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.project, "findUnique", () => ({ id: ownProjectId, tenantId: "tenant", companyId: "company", status: "ACTIVE" }));
  mockQuery(t, prisma.project, "findFirst", () => ({ name: "Project fixture", code: "FIX" }));
  let assignmentRevoked = false;
  mockQuery(t, prisma.projectMembership, "findUnique", (args) => {
    const { userId } = (args as { where: { tenantId_projectId_userId: { userId: string } } }).where.tenantId_projectId_userId;
    return userId === "limited" && !assignmentRevoked ? { id: "assigned" } : null;
  });
  mockQuery(t, prisma.projectMembership, "findMany", () => [{ projectId: ownProjectId }]);
  mockQuery(t, prisma.userMembership, "findMany", () => recipientIds.map((userId) => ({ userId })));
  mockQuery(t, prisma.userMembership, "findUnique", (args) => {
    const { userId } = (args as { where: { userId_tenantId: { userId: keyof typeof members } } }).where.userId_tenantId;
    return members[userId] ?? null;
  });
  mockQuery(t, prisma.emailDeliveryLog, "findMany", () => recipientIds.map((recipientUserId) => ({
    recipientUserId,
    status: "FAILED",
    metadata: { runWindow: "2026-11-01T03:00:00.000Z" },
  })));
  mockQuery(t, prisma.emailDeliveryLog, "findFirst", (args) => {
    const { where } = args as { where: { status?: string } };
    return where.status === "SENT" ? null : { id: "log" };
  });
  mockQuery(t, prisma.emailDeliveryLog, "update", () => ({ id: "log" }));
  const skipped = new Map<string, string>();
  mockQuery(t, prisma.emailDeliveryLog, "create", (args) => {
    const { data } = args as { data: { recipientUserId: string; skippedReason?: string } };
    if (data.skippedReason) skipped.set(data.recipientUserId, data.skippedReason);
    return { id: "log" };
  });
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = "fixture-only";
  process.env.RESEND_FROM_EMAIL = "reports@example.com";
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = oldFrom;
  });
  const sent = new Map<string, string[]>();
  t.mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { to: string; attachments: { filename: string }[] };
    sent.set(body.to, body.attachments.map(({ filename }) => filename));
    return Response.json({ id: "simulated-send" });
  });
  const build: BuildScheduledReportAttachmentFn = async (reportKey, _format, projectId, _params, ctx) => {
    assert.equal(projectId, ownProjectId);
    assert.equal(ctx.companyId, "company");
    assert.ok(["full", "limited"].includes(ctx.actorUserId));
    const full = ctx.roles.includes("OWNER");
    if (reportKey === "PROJECT_PROFITABILITY" && !full) throw new ServiceError("FORBIDDEN", "Sin acceso");
    return [{
      reportKey,
      filename: `${reportKey}-${full ? "all" : "restricted"}.csv`,
      content: Buffer.from("fixture"),
      contentType: "text/csv",
    }];
  };
  const run = [
    async () => (await runDueScheduledReportsForTenant("tenant", build))[0],
    () => runScheduledReportNow({ ...admin }, row.id, build),
    () => retryScheduledReportFailedDeliveries({ ...admin }, row.id, build),
  ];
  for (const execute of run) {
    skipped.clear();
    sent.clear();
    const summary = await execute();
    assert.equal(summary?.runStatus, "PARTIAL");
    assert.equal(summary?.recipientsSent, 2);
    assert.deepEqual(summary?.attachmentErrors, []);
    assert.deepEqual([...sent], [
      ["full@example.com", ["PROJECT_PROGRESS-all.csv", "PROJECT_PROFITABILITY-all.csv"]],
      ["limited@example.com", ["PROJECT_PROGRESS-restricted.csv"]],
    ]);
    assert.deepEqual([...skipped], [
      ["unassigned", "no_authorized_attachments"],
      ["foreign", "no_authorized_attachments"],
      ["disabled", "recipient_inactive"],
    ]);
  }

  selectedSchedule = {
    ...selectedSchedule,
    projectId: null,
    items: [
      { reportKey: "TENANT_TREASURY_CASH_POSITION", sortOrder: 0 },
      { reportKey: "TENANT_AP_AGING", sortOrder: 1 },
    ],
  };
  sent.clear();
  const treasuryRun = await runScheduledReportNow({ ...admin }, row.id, async (reportKey, _format, projectId, _params, ctx) => {
    assert.equal(projectId, null);
    if (ctx.actorUserId === "foreign") {
      assert.equal(ctx.companyId, "other-company");
      assert.equal(reportKey, "TENANT_TREASURY_CASH_POSITION");
    }
    if (!ctx.roles.includes("OWNER")) throw new ServiceError("FORBIDDEN", "Sin acceso");
    return [{ reportKey, filename: `${reportKey}.csv`, content: Buffer.from("fixture"), contentType: "text/csv" }];
  });
  assert.equal(treasuryRun.recipientsSent, 2);
  assert.deepEqual([...sent], [
    ["full@example.com", ["TENANT_TREASURY_CASH_POSITION.csv", "TENANT_AP_AGING.csv"]],
    ["foreign@example.com", ["TENANT_TREASURY_CASH_POSITION.csv"]],
  ]);

  selectedSchedule = row;
  for (const revoked of ["assignment", "gate"]) {
    sent.clear();
    skipped.clear();
    assignmentRevoked = false;
    gateRevoked = false;
    const afterRevocation = await runScheduledReportNow({ ...admin }, row.id, async (...args) => {
      const attachments = await build(...args);
      if (args[4].actorUserId === "limited") {
        assignmentRevoked = revoked === "assignment";
        gateRevoked = revoked === "gate";
      }
      return attachments;
    });
    assert.equal(afterRevocation.recipientsSent, 1);
    assert.deepEqual([...sent.keys()], ["full@example.com"]);
    assert.equal(skipped.get("limited"), "no_authorized_attachments");
  }
});
