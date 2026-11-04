import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";

import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  archiveNotification,
  getNotificationBellSnapshot,
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  markNotificationAsUnread,
} from "./notification.service";

const ctx: ServiceContext = {
  tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["PROJECT_MANAGER"],
};
const ids = {
  assigned: "00000000-0000-4000-8000-000000000001",
  revoked: "00000000-0000-4000-8000-000000000002",
  foreignCompany: "00000000-0000-4000-8000-000000000003",
  shared: "00000000-0000-4000-8000-000000000004",
  sharedProject: "00000000-0000-4000-8000-000000000005",
};

type Row = Record<string, unknown> & { id: string; status: string };

/** Minimal Prisma predicate semantics for the scalar/AND/OR filters used in these reads. */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND" || key === "OR") {
      const predicates = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
      return key === "AND"
        ? predicates.every((predicate) => matches(row, predicate))
        : predicates.some((predicate) => matches(row, predicate));
    }
    if (value && typeof value === "object" && "in" in value) {
      return (value.in as unknown[]).includes(row[key]);
    }
    return row[key] === value;
  });
}

function stub(t: TestContext, delegate: object, method: string, replacement: unknown): void {
  const target = delegate as Record<string, unknown>;
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
}

function setup(t: TestContext) {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
  stub(t, prisma.projectMembership, "findMany", async () => [
    { projectId: "assigned-project" }, { projectId: "shared-project" },
  ]);

  function row(id: string, overrides: Record<string, unknown> = {}): Row {
    return {
      id, tenantId: ctx.tenantId, companyId: ctx.companyId, recipientUserId: ctx.actorUserId,
      projectId: "assigned-project", status: "UNREAD", type: "DOCUMENT_UPLOAD_CONFIRMED",
      title: "Synthetic notification", body: "Synthetic content", severity: "INFO",
      linkedEntityType: null, linkedEntityId: null, actionUrl: null,
      createdAt: new Date("2026-01-01"), readAt: null, archivedAt: null,
      ...overrides,
    };
  }
  const rows = [
    row(ids.assigned),
    row(ids.revoked, { projectId: "revoked-project" }),
    row(ids.foreignCompany, { companyId: "another-company" }),
    row(ids.shared, { companyId: null, projectId: null }),
    row(ids.sharedProject, { companyId: null, projectId: "shared-project" }),
    row("foreign-tenant", { tenantId: "another-tenant" }),
    row("foreign-recipient", { recipientUserId: "another-user" }),
  ];
  stub(t, prisma.notification, "count", async ({ where }: { where: Record<string, unknown> }) =>
    rows.filter((item) => matches(item, where)).length);
  stub(t, prisma.notification, "findMany", async ({ where }: { where: Record<string, unknown> }) =>
    rows.filter((item) => matches(item, where)));
  stub(t, prisma.notification, "updateMany", async ({ where, data }: {
    where: Record<string, unknown>; data: Record<string, unknown>;
  }) => {
    const found = rows.filter((item) => matches(item, where));
    for (const item of found) Object.assign(item, data);
    return { count: found.length };
  });
  return rows;
}

describe("notification access after company/membership changes", { concurrency: false }, () => {
  it("disabled NOTIFICATIONS returns empty composed reads and denies direct mutations", async (t) => {
    setup(t);
    prisma.tenantModuleSetting.findMany = (async () => [{ moduleKey: "NOTIFICATIONS", isEnabled: false }]) as unknown as typeof prisma.tenantModuleSetting.findMany;
    const fresh = () => ({ ...ctx });
    assert.deepEqual(await getNotificationBellSnapshot(fresh()), { unreadCount: 0, items: [] });
    assert.equal(await getUnreadNotificationCount(fresh()), 0);
    assert.deepEqual(await listMyNotifications("all", fresh()), { items: [], total: 0, page: 1, pageSize: 20 });
    for (const mutate of [markNotificationAsRead, markNotificationAsUnread, archiveNotification]) {
      await assert.rejects(() => mutate(ids.assigned, fresh()),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    }
    await assert.rejects(() => markAllNotificationsAsRead(fresh()),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
  });

  it("bell, unread badge and inbox hide inaccessible content while keeping shared rows", async (t) => {
    setup(t);
    const snapshot = await getNotificationBellSnapshot({ ...ctx });
    const expected = [ids.assigned, ids.shared, ids.sharedProject];
    assert.equal(snapshot.unreadCount, 3);
    assert.deepEqual(snapshot.items.map((item) => item.id), expected);
    assert.equal(await getUnreadNotificationCount({ ...ctx }), 3);
    const inbox = await listMyNotifications("all", { ...ctx });
    assert.equal(inbox.total, 3);
    assert.deepEqual(inbox.items.map((item) => item.id), expected);
  });

  it("mark-all does not change notifications hidden by current access", async (t) => {
    const rows = setup(t);
    await markAllNotificationsAsRead({ ...ctx });
    assert.deepEqual(rows.filter((item) => item.status === "READ").map((item) => item.id),
      [ids.assigned, ids.shared, ids.sharedProject]);
  });

  for (const mutate of [markNotificationAsRead, markNotificationAsUnread, archiveNotification]) {
    it(`${mutate.name} rejects revoked and cross-company IDs`, async (t) => {
      const rows = setup(t);
      if (mutate === markNotificationAsUnread) {
        for (const row of rows) row.status = "READ";
      }
      for (const id of [ids.revoked, ids.foreignCompany]) {
        await assert.rejects(() => mutate(id, { ...ctx }),
          (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND");
      }
      await mutate(ids.assigned, { ...ctx });
    });
  }
});
