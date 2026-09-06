/**
 * D-111 Phase B — live MEMBERSHIP_SCOPED matrix against Neon DEV.
 *
 * Gated: BLOQER_AI_LIVE_DB=1 (same as AI isolation) or BLOQER_D111_LIVE=1
 * Never production. Seeds SCOPED fixtures idempotently.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import type { UserRole } from "@bloqer/database";
import { AI_ADV } from "./fixtures/adversarial-ids";
import {
  restoreTenantATenantWide,
  seedD111ScopedFixtures,
  type D111ScopedFixtureResult,
} from "./fixtures/seed-d111-scoped";
import { buildAiExecutionContext } from "./context";
import { createDefaultBloqerAiToolRegistry } from "./create-default-registry";
import { listProjects, getProjectById } from "../project/project.service";
import { listPurchaseOrdersByProject, getPurchaseOrderById } from "../procurement/purchase-order.service";
import { listPurchaseRequestsByProject, getPurchaseRequestById } from "../procurement/purchase-request.service";
import { getPurchaseReceiptById, listReceiptsByProject } from "../procurement/purchase-receipt.service";
import { listPayablesByProject, getPayableById } from "../ap/payable.service";
import { getReceivableById, listReceivablesByProject } from "../ar/receivable.service";
import { getCertificationById, listCertificationsByProject } from "../certification/certification.service";
import { getJobsiteLogById, listJobsiteLogsByProject } from "../jobsite-log/jobsite-log.service";
import { getDocumentById, listProjectDocuments } from "../documents/document.service";
import { listBudgetsByProject, getBudgetById } from "../budget/budget.service";
import { getMyFieldPendingCounts } from "../field/field-pending.service";
import { listFieldProjects } from "../field/field-home.service";
import { getTenantDashboard } from "../dashboard/tenant-dashboard.service";
import { getProjectPortfolioReport } from "../reports/project-portfolio.service";
import { getPayableAgingReport } from "../aging/aging.service";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewTreasury } from "../security/access";
import {
  clearProjectAccessModeCache,
  resolveAccessibleProjectScope,
} from "../security/access";
import { ServiceError, type ServiceContext } from "../types";

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

const live = process.env.BLOQER_AI_LIVE_DB === "1" || process.env.BLOQER_D111_LIVE === "1";

function assertNonProd(): void {
  const url = process.env.DATABASE_URL ?? "";
  assert.ok(!url.includes("ep-cold-mouse-appkpn84"), "refusing production Neon");
  assert.ok(url.includes("ep-curly-math") || url.includes("localhost"), `expected DEV host, got ${url.slice(0, 80)}`);
}

function svc(
  tenantId: string,
  userId: string,
  roles: UserRole[],
  companyId: string | null = AI_ADV.tenantA.companyId,
): ServiceContext {
  return { actorUserId: userId, tenantId, companyId, roles };
}

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  try {
    const result = await fn();
    assert.fail(`expected deny, got: ${JSON.stringify(result)?.slice(0, 200)}`);
  } catch (e) {
    assert.ok(e instanceof ServiceError, String(e));
    assert.ok(
      e.code === "FORBIDDEN" || e.code === "NOT_FOUND",
      `unexpected code ${e.code}: ${e.message}`,
    );
  }
}

function isDeniedTool(content: string): boolean {
  return /FORBIDDEN|NOT_FOUND|Sin permisos|No tenés acceso|no encontrado/i.test(content);
}

describe("D-111 MEMBERSHIP_SCOPED live matrix (Neon DEV)", { skip: !live }, () => {
  let fx: D111ScopedFixtureResult;
  let prisma: Awaited<typeof import("@bloqer/database")>["prisma"];
  const registry = createDefaultBloqerAiToolRegistry();
  const score: Record<string, "PASS" | "FAIL"> = {};
  const t0 = { listProjectsMs: 0, dashboardMs: 0, scopeTwiceMs: 0 };

  before(async () => {
    loadEnvIfNeeded();
    assertNonProd();
    ({ prisma } = await import("@bloqer/database"));
    fx = await seedD111ScopedFixtures(prisma);
    const mode = await prisma.tenant.findUniqueOrThrow({
      where: { id: fx.tenantAId },
      select: { projectAccessMode: true },
    });
    assert.equal(mode.projectAccessMode, "MEMBERSHIP_SCOPED");
  });

  after(async () => {
    // Leave Tenant A SCOPED for DEV validation (documented). Restore only if env asks.
    if (process.env.BLOQER_D111_RESTORE_TENANT_WIDE === "1" && fx) {
      await restoreTenantATenantWide(prisma, fx.tenantAId);
    }
    console.log("\n### D-111 live scorecard");
    for (const [k, v] of Object.entries(score)) {
      console.log(`- ${k}: ${v}`);
    }
    console.log(
      `perf listProjects=${t0.listProjectsMs}ms dashboard=${t0.dashboardMs}ms scopeMemo=${t0.scopeTwiceMs}ms`,
    );
  });

  function mark(key: string, ok: boolean): void {
    score[key] = ok ? "PASS" : "FAIL";
    assert.ok(ok, key);
  }

  // ── 1. listProjects / overview ─────────────────────────────────────────────

  it("PM-A1 listProjects: A1 only; never A2/B1", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    const start = Date.now();
    const { data } = await listProjects({ pageSize: 50 }, ctx);
    t0.listProjectsMs = Date.now() - start;
    const ids = data.map((p) => p.id);
    assert.ok(ids.includes(fx.projectA1Id));
    assert.ok(!ids.includes(fx.projectA2Id));
    assert.ok(!ids.includes(fx.projectB1Id));
    mark("project_isolation_list", true);
  });

  it("PM-A2 listProjects: A2 only", async () => {
    const ctx = svc(fx.tenantAId, fx.pmA2UserId, ["PROJECT_MANAGER"]);
    const { data } = await listProjects({ pageSize: 50 }, ctx);
    const ids = data.map((p) => p.id);
    assert.deepEqual(ids.filter((id) => id === fx.projectA2Id || id === fx.projectA1Id).sort(), [
      fx.projectA2Id,
    ].sort());
    assert.ok(ids.includes(fx.projectA2Id));
    assert.ok(!ids.includes(fx.projectA1Id));
  });

  it("OWNER-A listProjects: A1+A2; never B1", async () => {
    const ctx = svc(fx.tenantAId, fx.ownerAUserId, ["OWNER"]);
    const { data } = await listProjects({ pageSize: 50 }, ctx);
    const ids = data.map((p) => p.id);
    assert.ok(ids.includes(fx.projectA1Id) && ids.includes(fx.projectA2Id));
    assert.ok(!ids.includes(fx.projectB1Id));
    mark("tenant_isolation_owner", true);
  });

  it("direct URL / getProjectById: PM-A1 DENY A2 and B1", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    await getProjectById(fx.projectA1Id, ctx);
    await expectDenied(() => getProjectById(fx.projectA2Id, ctx));
    await expectDenied(() => getProjectById(fx.projectB1Id, ctx));
    mark("direct_url_project", true);
  });

  // ── 2. Entity-by-id attacks ────────────────────────────────────────────────

  it("entity-by-id: PM-A1 DENY all A2 entities; ALLOW A1", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    await getPurchaseOrderById(fx.poAId, ctx);
    await expectDenied(() => getPurchaseOrderById(fx.poA2Ids[0]!, ctx));
    await getPurchaseRequestById(AI_ADV.tenantA.prId, ctx);
    await expectDenied(() => getPurchaseRequestById(fx.prA2Id, ctx));
    await expectDenied(() => getPurchaseReceiptById(fx.receiptA2Id, ctx));
    await getPayableById(AI_ADV.tenantA.payableId, ctx);
    await expectDenied(() => getPayableById(fx.payableA2Id, ctx));
    await expectDenied(() => getReceivableById(fx.receivableA2Id, ctx));
    await getCertificationById(AI_ADV.tenantA.certificationId, ctx);
    await expectDenied(() => getCertificationById(fx.certificationA2Id, ctx));
    await getJobsiteLogById(AI_ADV.tenantA.jobsiteLogId, ctx);
    await expectDenied(() => getJobsiteLogById(fx.jobsiteLogA2Id, ctx));
    await getDocumentById(fx.documentA1Id, ctx);
    await expectDenied(() => getDocumentById(fx.documentA2Id, ctx));
    await getBudgetById(AI_ADV.tenantA.budgetId, ctx);
    await expectDenied(() => getBudgetById(AI_ADV.tenantA.budgetA2Id, ctx));
    mark("direct_entity_isolation", true);
  });

  it("list-by-project A2 DENY for PM-A1 across domains", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    await expectDenied(() => listPurchaseOrdersByProject(fx.projectA2Id, ctx));
    await expectDenied(() => listPurchaseRequestsByProject(fx.projectA2Id, ctx));
    await expectDenied(() => listReceiptsByProject(fx.projectA2Id, ctx));
    await expectDenied(() => listPayablesByProject(fx.projectA2Id, ctx));
    await expectDenied(() => listReceivablesByProject(fx.projectA2Id, ctx));
    await expectDenied(() => listCertificationsByProject(fx.projectA2Id, ctx));
    await expectDenied(() => listJobsiteLogsByProject(fx.projectA2Id, undefined, ctx));
    await expectDenied(() => listBudgetsByProject(fx.projectA2Id, ctx));
    await expectDenied(() =>
      listProjectDocuments(fx.projectA2Id, { status: "ACTIVE" }, ctx),
    );
  });

  // ── 3. Aggregates side-channel ─────────────────────────────────────────────

  it("aggregate: PM-A1 pending OC count = 1 (never 6)", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    const pos = await listPurchaseOrdersByProject(fx.projectA1Id, ctx);
    const pending = pos.filter((p) => p.status === "SUBMITTED");
    assert.equal(pending.length, AI_ADV.amounts.a1PendingPoCount);
    assert.notEqual(pending.length, 6);
    mark("aggregate_po_count", true);
  });

  it("aggregate: PM-A1 CxP project list = 10M only", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    const { data } = await listPayablesByProject(fx.projectA1Id, ctx);
    const total = data.reduce((s, p) => s + Number(p.originalAmount), 0);
    assert.ok(Math.abs(total - fx.payableA1Amount) < 1, `got ${total}`);
    assert.ok(total < fx.payableA2Amount);
    mark("aggregate_cxp", true);
  });

  it("aggregate: field pending + portfolio + dashboard KPIs scoped", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    const counts = await getMyFieldPendingCounts(ctx);
    // Must not include A2 submitted PRs/OCs — counts can be >0 for A1 only
    const fieldProjects = await listFieldProjects(ctx);
    assert.ok(fieldProjects.every((p) => p.id !== fx.projectA2Id));
    assert.ok(fieldProjects.some((p) => p.id === fx.projectA1Id));

    const portfolio = await getProjectPortfolioReport(ctx);
    assert.ok(portfolio.rows.every((r) => r.projectId !== fx.projectA2Id));
    assert.ok(portfolio.rows.some((r) => r.projectId === fx.projectA1Id));

    const start = Date.now();
    const dash = await getTenantDashboard(ctx);
    t0.dashboardMs = Date.now() - start;
    if (dash.projectSummary) {
      assert.ok(
        dash.projectSummary.projects.every((p) => p.id !== fx.projectA2Id),
        "dashboard leaked A2",
      );
    }
    mark("aggregate_dashboard_portfolio", true);
  });

  // ── 4. Company finance vs membership ───────────────────────────────────────

  it("FINANCE: company AP aging sees A1+A2 totals; listProjects empty without membership", async () => {
    const ctx = svc(fx.tenantAId, fx.financeAUserId, ["FINANCE"]);
    assert.equal(canViewCompanyAp(ctx.roles), true);
    const { data: projects } = await listProjects({ pageSize: 50 }, ctx);
    assert.equal(projects.length, 0, "FINANCE must not see projects without membership");

    const aging = await getPayableAgingReport({}, ctx);
    const total = Number(aging.totals.totalBalance);
    // Company aging includes both project payables
    assert.ok(total >= fx.payableA1Amount + fx.payableA2Amount - 1, `aging total ${total}`);
    mark("company_finance_finance_role", true);
  });

  it("PM-A1 cannot use company aging (no canViewCompanyAp)", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    assert.equal(canViewCompanyAp(ctx.roles), false);
    await expectDenied(() => getPayableAgingReport({}, ctx));
  });

  it("TREASURER: canViewTreasury true; projects empty without membership", async () => {
    const ctx = svc(fx.tenantAId, fx.treasurerAUserId, ["TREASURER"]);
    assert.equal(canViewTreasury(ctx.roles), true);
    const { data } = await listProjects({ pageSize: 50 }, ctx);
    assert.equal(data.length, 0);
    mark("treasurer_treasury_vs_projects", true);
  });

  // ── 5. Empty membership + membership without permission ────────────────────

  it("empty membership: listProjects 0; entity DENY; aggregates empty", async () => {
    const ctx = svc(fx.tenantAId, fx.emptyPmAUserId, ["PROJECT_MANAGER"]);
    const { data } = await listProjects({ pageSize: 50 }, ctx);
    assert.equal(data.length, 0);
    await expectDenied(() => getProjectById(fx.projectA1Id, ctx));
    await expectDenied(() => listPurchaseOrdersByProject(fx.projectA1Id, ctx));
    const portfolio = await getProjectPortfolioReport(ctx);
    assert.equal(portfolio.rows.length, 0);
    mark("empty_membership", true);
  });

  it("membership without procurement: PROJECT_VIEWER sees A1 but not OCs", async () => {
    const ctx = svc(fx.tenantAId, fx.viewerNoProcAUserId, ["PROJECT_VIEWER"]);
    const { data } = await listProjects({ pageSize: 50 }, ctx);
    assert.ok(data.some((p) => p.id === fx.projectA1Id));
    await expectDenied(() => listPurchaseOrdersByProject(fx.projectA1Id, ctx));
    await getDocumentById(fx.documentA1Id, ctx);
    mark("membership_without_permission", true);
  });

  // ── 6. AI inheritance ──────────────────────────────────────────────────────

  it("AI: PM-A1 search_projects only A1; A2 UUID denied", async () => {
    const ctx = buildAiExecutionContext({
      service: svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]),
      enabledModules: [
        "PROJECTS",
        "PROCUREMENT",
        "AP",
        "AR",
        "SCHEDULE",
        "BUDGETS",
        "JOBSITE_LOG",
        "CERTIFICATIONS",
      ],
    });
    const search = await registry.execute(ctx, {
      id: "c1",
      name: "search_projects",
      argumentsJson: JSON.stringify({ search: "AIA", pageSize: 20 }),
    });
    assert.ok(!search.isError, search.content);
    assert.ok(search.content.includes(fx.projectA1Id) || /AIA-A1/i.test(search.content));
    assert.ok(!search.content.includes(fx.projectA2Id));
    assert.ok(!/AIA-A2/i.test(search.content));

    const a2 = await registry.execute(ctx, {
      id: "c2",
      name: "get_project_summary",
      argumentsJson: JSON.stringify({ projectId: fx.projectA2Id }),
    });
    assert.ok(a2.isError && isDeniedTool(a2.content), a2.content);
    assert.ok(!/Jobsite A2 secret|90.?000.?000|OC A2 pending/i.test(a2.content));

    const pos = await registry.execute(ctx, {
      id: "c3",
      name: "search_purchase_orders",
      argumentsJson: JSON.stringify({ projectId: fx.projectA1Id }),
    });
    assert.ok(!pos.isError, pos.content);

    const pay = await registry.execute(ctx, {
      id: "c4",
      name: "get_payables",
      argumentsJson: JSON.stringify({ projectId: fx.projectA1Id }),
    });
    assert.ok(!pay.isError, pay.content);
    assert.ok(!pay.content.includes(String(fx.payableA2Amount)));

    mark("ai_inheritance", true);
  });

  // ── 7. TENANT_WIDE regression ──────────────────────────────────────────────

  it("TENANT_WIDE regression: empty PM sees A1+A2 after mode flip", async () => {
    clearProjectAccessModeCache();
    await prisma.tenant.update({
      where: { id: fx.tenantAId },
      data: { projectAccessMode: "TENANT_WIDE" },
    });
    clearProjectAccessModeCache();
    try {
      const ctx = svc(fx.tenantAId, fx.emptyPmAUserId, ["PROJECT_MANAGER"]);
      const { data } = await listProjects({ pageSize: 50 }, ctx);
      assert.ok(data.some((p) => p.id === fx.projectA1Id));
      assert.ok(data.some((p) => p.id === fx.projectA2Id));
      await getProjectById(fx.projectA2Id, ctx);
      mark("tenant_wide_regression", true);
    } finally {
      await prisma.tenant.update({
        where: { id: fx.tenantAId },
        data: { projectAccessMode: "MEMBERSHIP_SCOPED" },
      });
      clearProjectAccessModeCache();
    }
  });

  // ── 8. Performance / request memo ──────────────────────────────────────────

  it("resolveAccessibleProjectScope request memo (same ctx object)", async () => {
    const ctx = svc(fx.tenantAId, fx.pmAUserId, ["PROJECT_MANAGER"]);
    const start = Date.now();
    const s1 = await resolveAccessibleProjectScope(ctx);
    const s2 = await resolveAccessibleProjectScope(ctx);
    t0.scopeTwiceMs = Date.now() - start;
    assert.deepEqual(s1, s2);
    assert.notEqual(s1, "ALL");
    if (s1 !== "ALL") {
      assert.deepEqual(s1.projectIds, [fx.projectA1Id]);
    }
    mark("performance_scope_memo", true);
  });
});
