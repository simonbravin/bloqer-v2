/**
 * Live AI tool isolation / RBAC / module-gate tests against Neon DEV fixtures.
 *
 * Gated: BLOQER_AI_LIVE_DB=1
 * Never production. Seeds adversarial fixtures idempotently when enabled.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, before } from "node:test";
import type { UserRole } from "@bloqer/database";
import { AI_ADV } from "./fixtures/adversarial-ids";
import { seedAiAdversarialFixtures, type AiAdversarialFixtureResult } from "./fixtures/seed-adversarial-tenants";
import { buildAiExecutionContext } from "./context";
import { createDefaultBloqerAiToolRegistry } from "./create-default-registry";
import type { ServiceContext } from "../types";

function loadEnvIfNeeded(): void {
  if (process.env.DATABASE_URL) return;
  for (const p of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        let v = m[2]!;
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
      }
      return;
    } catch {
      /* next */
    }
  }
}

const live = process.env.BLOQER_AI_LIVE_DB === "1";

function assertNonProd(): void {
  const url = process.env.DATABASE_URL ?? "";
  assert.ok(!url.includes("ep-cold-mouse-appkpn84"), "refusing production Neon");
}

function svc(
  tenantId: string,
  userId: string,
  roles: UserRole[],
  companyId: string | null = AI_ADV.tenantA.companyId,
): ServiceContext {
  return { actorUserId: userId, tenantId, companyId, roles };
}

function parseToolJson(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  return parsed;
}

function isDenied(content: string): boolean {
  const j = parseToolJson(content);
  const code = String(j.code ?? "");
  const err = String(j.error ?? "");
  return (
    code === "FORBIDDEN" ||
    code === "NOT_FOUND" ||
    /deshabilitado|Cross-tenant|no encontrado|Sin permisos|FORBIDDEN|NOT_FOUND/i.test(
      `${code} ${err}`,
    )
  );
}

function leaksTenantB(content: string, fx: AiAdversarialFixtureResult): boolean {
  const lower = content.toLowerCase();
  return (
    content.includes(fx.projectB1Id) ||
    content.includes(fx.poBId) ||
    content.includes(fx.tenantBId) ||
    lower.includes("obra ai adv b1") ||
    lower.includes("aib-b1") ||
    lower.includes("secret")
  );
}

describe("Bloqer AI live isolation (Neon DEV)", { skip: !live }, () => {
  let fx: AiAdversarialFixtureResult;
  let prisma: Awaited<typeof import("@bloqer/database")>["prisma"];
  const registry = createDefaultBloqerAiToolRegistry();

  before(async () => {
    loadEnvIfNeeded();
    assertNonProd();
    ({ prisma } = await import("@bloqer/database"));
    fx = await seedAiAdversarialFixtures(prisma);
  });

  async function exec(
    name: string,
    args: Record<string, unknown>,
    ctx: ReturnType<typeof buildAiExecutionContext>,
  ) {
    return registry.execute(ctx, {
      id: `call_${name}`,
      name,
      argumentsJson: JSON.stringify(args),
    });
  }

  it("search_projects from Tenant A never returns Tenant B", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
      enabledModules: new Set(["PROJECTS", "PROCUREMENT", "AP", "AR", "SCHEDULE", "BUDGETS", "JOBSITE_LOG", "CERTIFICATIONS", "TREASURY"] as never),
    });
    const res = await exec("search_projects", { search: "AI Adv", pageSize: 20 }, ctx);
    assert.equal(res.isError, undefined);
    assert.ok(!leaksTenantB(res.content, fx), res.content.slice(0, 400));
    assert.ok(res.content.includes(fx.projectA1Id) || res.content.includes("AIA-A1"), res.content.slice(0, 400));
  });

  it("cross-tenant: resolve foreign projectId → denied, no B metadata", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
      currentProjectId: fx.projectA1Id,
    });
    const tools = [
      ["get_project_summary", { projectId: fx.projectB1Id }],
      ["search_purchase_orders", { projectId: fx.projectB1Id }],
      ["search_purchase_requests", { projectId: fx.projectB1Id }],
      ["get_pending_purchase_orders", { projectId: fx.projectB1Id }],
      ["get_delayed_schedule_items", { projectId: fx.projectB1Id }],
      ["get_project_schedule_summary", { projectId: fx.projectB1Id }],
      ["get_project_material_shortages", { projectId: fx.projectB1Id }],
      ["get_recent_jobsite_logs", { projectId: fx.projectB1Id }],
      ["get_payables", { projectId: fx.projectB1Id }],
      ["get_receivables", { projectId: fx.projectB1Id }],
      ["get_project_certification_summary", { projectId: fx.projectB1Id }],
    ] as const;

    for (const [name, args] of tools) {
      const res = await exec(name, args, ctx);
      assert.ok(res.isError || isDenied(res.content), `${name}: ${res.content.slice(0, 200)}`);
      assert.ok(!leaksTenantB(res.content, fx), `${name} leaked B: ${res.content.slice(0, 300)}`);
    }
  });

  it("cross-tenant: get_purchase_order with Tenant B PO id → denied", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
    });
    const res = await exec("get_purchase_order", { purchaseOrderId: fx.poBId }, ctx);
    assert.ok(res.isError && isDenied(res.content), res.content);
    assert.ok(!leaksTenantB(res.content, fx), res.content);
    assert.ok(!/60500|9201|SUBMITTED/i.test(res.content) || isDenied(res.content));
  });

  it("cross-project: manipulated currentProjectId for foreign project denied", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
      currentProjectId: fx.projectB1Id,
      currentRoute: `/proyectos/${fx.projectB1Id}/materiales`,
    });
    const res = await exec("get_project_summary", {}, ctx);
    assert.ok(res.isError && isDenied(res.content), res.content);
    assert.ok(!leaksTenantB(res.content, fx), res.content);
  });

  it("cross-project: nonexistent project UUID → NOT_FOUND/FORBIDDEN", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
    });
    const res = await exec(
      "get_project_summary",
      { projectId: "00000000-0000-4000-8000-ffffffffffff" },
      ctx,
    );
    assert.ok(res.isError && isDenied(res.content), res.content);
  });

  it("same-tenant A1 tools return data for OWNER", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
      currentProjectId: fx.projectA1Id,
    });
    const po = await exec("get_purchase_order", { purchaseOrderId: fx.poAId }, ctx);
    assert.ok(!po.isError, po.content);
    assert.ok(po.content.includes(fx.poAId) || /SUBMITTED/i.test(po.content), po.content.slice(0, 300));
    // Injection strings are DATA, not policy
    assert.ok(
      po.content.includes(AI_ADV.injection.poNotes) || /environment variables/i.test(po.content),
      "expected injection notes as data",
    );
  });

  it("RBAC matrix: VIEWER can read PO; cannot invent elevated access", async () => {
    const viewerCtx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.viewerAUserId, ["VIEWER"]),
      currentProjectId: fx.projectA1Id,
    });
    const ownerCtx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
      currentProjectId: fx.projectA1Id,
    });
    const pmCtx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]),
      currentProjectId: fx.projectA1Id,
    });

    const matrix: Array<{
      tool: string;
      args: Record<string, unknown>;
      owner: "ok" | "deny";
      pm: "ok" | "deny";
      viewer: "ok" | "deny";
    }> = [
      { tool: "search_purchase_orders", args: {}, owner: "ok", pm: "ok", viewer: "ok" },
      { tool: "get_delayed_schedule_items", args: {}, owner: "ok", pm: "ok", viewer: "ok" },
      { tool: "get_payables", args: {}, owner: "ok", pm: "ok", viewer: "ok" },
      { tool: "get_receivables", args: {}, owner: "ok", pm: "ok", viewer: "ok" },
      { tool: "get_project_certification_summary", args: {}, owner: "ok", pm: "ok", viewer: "ok" },
      { tool: "get_cash_position", args: {}, owner: "ok", pm: "deny", viewer: "ok" },
    ];

    const rows: string[] = [];
    for (const row of matrix) {
      const run = async (role: "OWNER" | "PM" | "VIEWER", expect: "ok" | "deny") => {
        const c = role === "OWNER" ? ownerCtx : role === "PM" ? pmCtx : viewerCtx;
        const res = await exec(row.tool, row.args, c);
        const denied = Boolean(res.isError && isDenied(res.content));
        const ok = !denied;
        const actual = ok ? "ok" : "deny";
        rows.push(`| ${row.tool} | ${role} | expected ${expect} | actual ${actual} |`);
        if (expect === "ok") {
          assert.ok(ok, `${row.tool}/${role}: ${res.content.slice(0, 200)}`);
        } else {
          // PM may lack TREASURY VIEW — cash should deny or return empty gated error
          assert.ok(denied || /deshabilitado|Sin permiso|tesorer/i.test(res.content), `${row.tool}/${role}`);
        }
      };
      await run("OWNER", row.owner);
      await run("PM", row.pm);
      await run("VIEWER", row.viewer);
    }
    // Keep matrix visible in test output
    console.log("\n### RBAC matrix\n| Tool | Role | Expected | Actual |\n|---|---|---|---|\n" + rows.join("\n"));
  });

  it("module gate: PROCUREMENT off blocks PR/PO tools", async () => {
    await prisma.tenantModuleSetting.upsert({
      where: {
        tenantId_moduleKey: { tenantId: fx.tenantAId, moduleKey: "PROCUREMENT" },
      },
      update: { isEnabled: false },
      create: { tenantId: fx.tenantAId, moduleKey: "PROCUREMENT", isEnabled: false },
    });
    try {
      const ctx = buildAiExecutionContext({
        service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
        currentProjectId: fx.projectA1Id,
      });
      const res = await exec("search_purchase_orders", {}, ctx);
      assert.ok(res.isError, res.content);
      assert.match(res.content, /PROCUREMENT|deshabilitado/i);
      assert.ok(!leaksTenantB(res.content, fx));
      // Must not still list PO rows
      assert.ok(!res.content.includes(fx.poAId) || /deshabilitado/i.test(res.content));
    } finally {
      await prisma.tenantModuleSetting.upsert({
        where: {
          tenantId_moduleKey: { tenantId: fx.tenantAId, moduleKey: "PROCUREMENT" },
        },
        update: { isEnabled: true },
        create: { tenantId: fx.tenantAId, moduleKey: "PROCUREMENT", isEnabled: true },
      });
    }
  });

  it("module gate: AP off blocks get_payables", async () => {
    await prisma.tenantModuleSetting.upsert({
      where: { tenantId_moduleKey: { tenantId: fx.tenantAId, moduleKey: "AP" } },
      update: { isEnabled: false },
      create: { tenantId: fx.tenantAId, moduleKey: "AP", isEnabled: false },
    });
    try {
      const ctx = buildAiExecutionContext({
        service: svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]),
        currentProjectId: fx.projectA1Id,
      });
      const res = await exec("get_payables", {}, ctx);
      assert.ok(res.isError && /AP|deshabilitado/i.test(res.content), res.content);
    } finally {
      await prisma.tenantModuleSetting.upsert({
        where: { tenantId_moduleKey: { tenantId: fx.tenantAId, moduleKey: "AP" } },
        update: { isEnabled: true },
        create: { tenantId: fx.tenantAId, moduleKey: "AP", isEnabled: true },
      });
    }
  });

  it("documents: ProjectTeamMember is not project ACL (A2 visible to same-tenant VIEWER)", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.viewerAUserId, ["VIEWER"]),
    });
    const res = await exec("search_projects", { search: "AIA-A2" }, ctx);
    assert.ok(!res.isError, res.content);
    assert.ok(res.content.includes(fx.projectA2Id) || /AIA-A2/i.test(res.content), res.content.slice(0, 300));
  });
});
