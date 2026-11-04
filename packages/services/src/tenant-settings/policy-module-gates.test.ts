import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma } from "@bloqer/database";

import {
  getApprovedBudgetEditsPolicy, getProjectApprovedBudgetEditFlags,
  updateProjectApprovedBudgetEditsPolicy, updateTenantApprovedBudgetEditsPolicy,
} from "../budget/approved-budget-edits.service";
import {
  getTenantNotificationEmailPolicy, updateTenantNotificationEmailPolicy,
} from "../notifications/notification-email-preference.service";
import {
  getCompanyProcurementSettings, getCompanyProcurementSettingsForProject, upsertCompanyProcurementSettings,
} from "../procurement/company-procurement-settings.service";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";

const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "owner", roles: ["OWNER"] };
const projectId = "00000000-0000-4000-8000-000000000001";
const sharedId = "00000000-0000-4000-8000-000000000002";
const foreignId = "00000000-0000-4000-8000-000000000003";

function stub(t: TestContext, delegate: object, method: string, replacement: unknown): void {
  const target = delegate as Record<string, unknown>;
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
}

const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

function setupProject(t: TestContext, companyId: string | null, mode = "TENANT_WIDE") {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: mode, allowApprovedBudgetEconomicEdits: false }));
  stub(t, prisma.project, "findUnique", async () => ({
    id: projectId, tenantId: ctx.tenantId, companyId, country: "AR", status: "ACTIVE",
    allowApprovedBudgetEconomicEdits: false,
  }));
}

describe("tenant policy mutations honor configuration availability", { concurrency: false }, () => {
  for (const [name, update] of [
    ["procurement", () => upsertCompanyProcurementSettings(ctx.companyId!, {}, ctx)],
    ["tenant approved-budget edits", () => updateTenantApprovedBudgetEditsPolicy({ allow: true }, ctx)],
    ["project approved-budget edits", () => updateProjectApprovedBudgetEditsPolicy({ projectId, allow: true }, ctx)],
    ["notification email policy", () => updateTenantNotificationEmailPolicy({ digestEnabledDefault: false }, ctx)],
  ] as const) {
    it(`${name} rejects TENANT_SETTINGS off before any policy read/write`, async (t) => {
      stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "TENANT_SETTINGS", isEnabled: false }]);
      await assert.rejects(update, (error: unknown) => forbidden(error) && error instanceof ServiceError && error.message.includes("deshabilitado"));
    });
  }

  it("operational company and project policy reads remain available when configuration is off", async (t) => {
    clearProjectAccessModeCache();
    t.after(clearProjectAccessModeCache);
    const moduleLookup = t.mock.fn(async () => [{ moduleKey: "TENANT_SETTINGS", isEnabled: false }]);
    stub(t, prisma.tenantModuleSetting, "findMany", moduleLookup);
    stub(t, prisma.company, "findFirst", async () => ({ id: ctx.companyId }));
    stub(t, prisma.companyProcurementSettings, "findUnique", async () => null);
    stub(t, prisma.project, "findUnique", async () => ({
      id: projectId, tenantId: ctx.tenantId, companyId: ctx.companyId, country: "AR", status: "ACTIVE",
      allowApprovedBudgetEconomicEdits: false,
    }));
    stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE", allowApprovedBudgetEconomicEdits: false }));
    assert.equal((await getCompanyProcurementSettings(ctx.companyId!, ctx)).companyId, ctx.companyId);
    assert.equal((await getCompanyProcurementSettingsForProject(projectId, ctx)).companyId, ctx.companyId);
    const budgetFlags = await getProjectApprovedBudgetEditFlags(projectId, ctx);
    assert.equal(budgetFlags.tenantAllow, false);
    assert.equal(budgetFlags.canManagePolicy, false, "configuration off prevents exposing a management action");
    assert.equal(moduleLookup.mock.callCount(), 1, "budget flags check BUDGETS availability while remaining readable with settings off");
  });

  it("tenant email policy reads do not require configuration availability", async (t) => {
    const moduleLookup = t.mock.fn(async () => [{ moduleKey: "TENANT_SETTINGS", isEnabled: false }]);
    stub(t, prisma.tenantModuleSetting, "findMany", moduleLookup);
    stub(t, prisma.tenantNotificationEmailPolicy, "upsert", async () => ({
      tenantId: ctx.tenantId, leadershipDailyFlowEmailCc: false, digestEnabledDefault: true, digestHourLocal: 7,
    }));
    assert.equal((await getTenantNotificationEmailPolicy(ctx)).digestEnabledDefault, true);
    assert.equal(moduleLookup.mock.callCount(), 0);
  });
});

describe("policy company and project isolation", { concurrency: false }, () => {
  for (const [name, readOrUpdate] of [
    ["company procurement read", () => getCompanyProcurementSettings("other-company", ctx)],
    ["company procurement update", () => upsertCompanyProcurementSettings("other-company", {}, ctx)],
  ] as const) {
    it(`${name} rejects another company even for OWNER`, async (t) => {
      stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
      stub(t, prisma.company, "findFirst", async () => ({ id: "other-company" }));
      await assert.rejects(readOrUpdate, forbidden);
    });
  }

  for (const [name, readOrUpdate] of [
    ["project procurement settings", (ctx: ServiceContext) => getCompanyProcurementSettingsForProject(projectId, ctx)],
    ["approved-budget flags", (ctx: ServiceContext) => getProjectApprovedBudgetEditFlags(projectId, ctx)],
    ["approved-budget policy mutation", (ctx: ServiceContext) => updateProjectApprovedBudgetEditsPolicy({ projectId, allow: false }, ctx)],
  ] as const) {
    it(`${name} rejects another company's project even for OWNER`, async (t) => {
      setupProject(t, "other-company");
      await assert.rejects(() => readOrUpdate(ctx), forbidden);
    });
  }

  for (const [name, read] of [
    ["project procurement settings", getCompanyProcurementSettingsForProject],
    ["approved-budget flags", getProjectApprovedBudgetEditFlags],
  ] as const) {
    it(`${name} rejects an unassigned project under MEMBERSHIP_SCOPED`, async (t) => {
      setupProject(t, ctx.companyId, "MEMBERSHIP_SCOPED");
      stub(t, prisma.projectMembership, "findUnique", async () => null);
      await assert.rejects(() => read(projectId, { ...ctx, roles: ["PROJECT_MANAGER"] }), forbidden);
    });
  }

  it("the policy table scopes projects before reading budget details and preserves shared rows", async (t) => {
    clearProjectAccessModeCache();
    t.after(clearProjectAccessModeCache);
    const projects = [
      { id: projectId, tenantId: ctx.tenantId, companyId: ctx.companyId },
      { id: sharedId, tenantId: ctx.tenantId, companyId: null },
      { id: foreignId, tenantId: ctx.tenantId, companyId: "other-company" },
    ].map((row) => ({ ...row, code: row.id, name: "Synthetic", status: "ACTIVE", allowApprovedBudgetEconomicEdits: false }));
    type Row = typeof projects[number];
    function matches(row: Row, where: Record<string, unknown>): boolean {
      return Object.entries(where).every(([key, value]) => {
        if (key === "OR") return (value as Record<string, unknown>[]).some((term) => matches(row, term));
        if (value && typeof value === "object" && "in" in value) return (value.in as unknown[]).includes(row[key as keyof Row]);
        return row[key as keyof Row] === value;
      });
    }
    stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
    stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE" }));
    stub(t, prisma.tenant, "findFirst", async () => ({ allowApprovedBudgetEconomicEdits: false }));
    stub(t, prisma.project, "findMany", async ({ where }: { where: Record<string, unknown> }) => projects.filter((row) => matches(row, where)));
    const budgetLookup = t.mock.fn(async () => []);
    stub(t, prisma.budget, "findMany", budgetLookup);
    const policy = await getApprovedBudgetEditsPolicy(ctx);
    assert.deepEqual(policy.projects.map((row) => row.id), [projectId, sharedId]);
    assert.deepEqual(budgetLookup.mock.calls[0]!.arguments, [{
      where: { tenantId: ctx.tenantId, projectId: { in: [projectId, sharedId] }, OR: [{ companyId: ctx.companyId }, { companyId: null }] },
      select: { projectId: true, name: true, versionNumber: true, status: true, parentBudgetId: true },
      orderBy: [{ projectId: "asc" }, { versionNumber: "desc" }],
    }]);
  });
});
