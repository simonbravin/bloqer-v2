import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";

import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  addProjectMembership, getTenantProjectAccessModeForAdmin, getUserProjectAccessEditor,
  importMembershipsFromProjectTeam, listProjectMemberships, previewImportMembershipsFromProjectTeam,
  previewMembershipScopedActivation, removeProjectMembership, setTenantProjectAccessMode, setUserProjectMemberships,
} from "./project-membership.service";

const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "owner", roles: ["OWNER"] };

function stub(t: TestContext, delegate: object, method: string, replacement: unknown): void {
  const target = delegate as Record<string, unknown>;
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
}

const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

describe("membership administration gates and scope", { concurrency: false }, () => {
  it("disabled USERS_PERMISSIONS denies all management entry points before data access", async (t) => {
    stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "USERS_PERMISSIONS", isEnabled: false }]);
    const operations = [
      () => getUserProjectAccessEditor("target", ctx),
      () => setUserProjectMemberships("target", [], ctx),
      () => addProjectMembership("project", "target", ctx),
      () => removeProjectMembership("project", "membership", ctx),
      () => listProjectMemberships("project", ctx),
      () => previewImportMembershipsFromProjectTeam("project", ctx),
      () => importMembershipsFromProjectTeam("project", ctx),
    ];
    for (const operate of operations) await assert.rejects(operate, forbidden);
  });

  it("mode mutation requires TENANT_SETTINGS enabled, independent of the users branch", async (t) => {
    stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "TENANT_SETTINGS", isEnabled: false }]);
    await assert.rejects(() => setTenantProjectAccessMode({ mode: "TENANT_WIDE" }, ctx), forbidden);
  });

  it("either permitted enabled read branch can expose the admin mode", async (t) => {
    clearProjectAccessModeCache();
    t.after(clearProjectAccessModeCache);
    let disabled = "USERS_PERMISSIONS";
    stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: disabled, isEnabled: false }]);
    stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
    assert.equal(await getTenantProjectAccessModeForAdmin(ctx), "MEMBERSHIP_SCOPED");
    disabled = "TENANT_SETTINGS";
    assert.equal(await getTenantProjectAccessModeForAdmin(ctx), "MEMBERSHIP_SCOPED");
  });

  it("both disabled branches deny mode reads and impact preview", async (t) => {
    stub(t, prisma.tenantModuleSetting, "findMany", async () => ["USERS_PERMISSIONS", "TENANT_SETTINGS"]
      .map((moduleKey) => ({ moduleKey, isEnabled: false })));
    await assert.rejects(() => getTenantProjectAccessModeForAdmin(ctx), forbidden);
    await assert.rejects(() => previewMembershipScopedActivation(ctx), forbidden);
  });

  it("an anchored editor cannot expose a target from another company", async (t) => {
    stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
    stub(t, prisma.userMembership, "findFirst", async () => ({
      id: "target-membership", companyId: "other-company", roles: ["PROJECT_MANAGER"],
      company: { tenantId: ctx.tenantId, status: "ACTIVE" },
      user: { id: "target", email: "target@example.test", name: "Synthetic" },
    }));
    await assert.rejects(() => getUserProjectAccessEditor("target", ctx), forbidden);
  });
});
