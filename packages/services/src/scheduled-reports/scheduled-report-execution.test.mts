import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";

import type { ServiceContext } from "../types";

const require = createRequire(import.meta.url);
const { prisma } = require("@bloqer/database") as typeof import("@bloqer/database");
const {
  buildScheduledReportsCronServiceContext,
  clearProjectAccessModeCache,
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
    assert.deepEqual(args, {
      where: { userId_tenantId: { userId: "recipient", tenantId: "tenant" } },
      select: { status: true },
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
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "TENANT_WIDE" }));
  mockQuery(t, prisma.project, "findMany", () => [{ id: ownProjectId }]);
  mockQuery(t, prisma.scheduledReport, "findFirst", () => row);
  mockQuery(t, prisma.scheduledReport, "updateMany", () => ({ count: 1 }));
  mockQuery(t, prisma.scheduledReport, "update", (args) => {
    const { data } = args as { data: Record<string, unknown> };
    assert.ok(!Object.hasOwn(data, "companyId"));
    assert.ok(!Object.hasOwn(data, "nextRunAt"));
    return row;
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
    const { where } = args as { where: { OR: unknown; status: string } };
    assert.equal(where.status, "FAILED");
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
  mockQuery(t, prisma.tenant, "findUnique", () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  mockQuery(t, prisma.tenant, "findFirst", () => ({ name: "Test" }));
  let scopeReads = 0;
  mockQuery(t, prisma.project, "findUnique", () => {
    scopeReads++;
    return { id: ownProjectId, tenantId: "tenant", companyId: null, status: "ACTIVE" };
  });
  mockQuery(t, prisma.userMembership, "findMany", () => members);
  mockQuery(t, prisma.userMembership, "findUnique", () => ({ status: "ACTIVE" }));
  mockQuery(t, prisma.projectMembership, "findMany", () =>
    ["own", "other", "no-permission"].map((userId) => ({ userId })),
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

  assert.equal(scopeReads, 2);
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
  clearProjectAccessModeCache();
});
