import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { UserRole } from "@bloqer/domain";
import { createDefaultBloqerAiToolRegistry } from "./create-default-registry";
import { buildAiExecutionContext } from "./context";
import type { AiExecutionContext } from "./types";
import {
  AI_DENY_MESSAGES,
  aiCanViewTreasury,
  aiCanViewProcurement,
  preferredFirstName,
} from "./policy/access";
import { minimizeAgingTopItem, minimizeNotes } from "./policy/minimize";

function ctx(
  roles: UserRole[],
  opts?: Partial<AiExecutionContext> & { displayName?: string },
): AiExecutionContext {
  return buildAiExecutionContext({
    service: {
      actorUserId: "00000000-0000-4000-8000-000000000001",
      tenantId: "00000000-0000-4000-8000-000000000002",
      companyId: null,
      roles,
    },
    actorDisplayName: opts?.displayName ?? "Simón Bravin",
    enabledModules: opts?.enabledModules ?? [
      "PROJECTS",
      "PROCUREMENT",
      "AP",
      "AR",
      "SCHEDULE",
      "BUDGETS",
      "JOBSITE_LOG",
      "CERTIFICATIONS",
      "TREASURY",
    ],
    ...opts,
  });
}

describe("Bloqer AI zero-trust advertise filter", () => {
  const registry = createDefaultBloqerAiToolRegistry();

  it("PM (Jefe de obra) never sees get_cash_position in advertised tools", () => {
    const names = registry
      .definitions({ risks: ["READ"], ctx: ctx(["PROJECT_MANAGER"]), logAdvertise: false })
      .map((t) => t.name);
    assert.ok(!names.includes("get_cash_position"));
    assert.ok(names.includes("get_project_summary"));
    assert.ok(names.includes("search_purchase_orders"));
    assert.ok(names.includes("get_payables"));
  });

  it("OWNER with treasury module sees get_cash_position", () => {
    const names = registry
      .definitions({ risks: ["READ"], ctx: ctx(["OWNER"]), logAdvertise: false })
      .map((t) => t.name);
    assert.ok(names.includes("get_cash_position"));
  });

  it("PROJECT_VIEWER does not get procurement tools (AI stricter than VIEW PROJECTS fallback)", () => {
    const names = registry
      .definitions({ risks: ["READ"], ctx: ctx(["PROJECT_VIEWER"]), logAdvertise: false })
      .map((t) => t.name);
    assert.ok(!names.includes("search_purchase_orders"));
    assert.ok(!names.includes("get_pending_purchase_orders"));
    assert.ok(names.includes("get_project_summary") || names.includes("search_projects"));
  });

  it("VIEWER does not see get_cash_position (AI stricter than D-056 UI)", () => {
    const names = registry
      .definitions({ risks: ["READ"], ctx: ctx(["VIEWER"]), logAdvertise: false })
      .map((t) => t.name);
    assert.ok(!names.includes("get_cash_position"));
    assert.equal(aiCanViewTreasury(["VIEWER"]), false);
    assert.equal(aiCanViewTreasury(["OWNER"]), true);
    assert.equal(aiCanViewTreasury(["FINANCE"]), true);
    assert.equal(aiCanViewTreasury(["TREASURER"]), true);
    assert.equal(aiCanViewTreasury(["ADMIN"]), true);
    assert.equal(aiCanViewTreasury(["VIEWER", "OWNER"]), true);
  });

  it("direct invoke get_cash_position as VIEWER is DENY with no leak", async () => {
    const res = await registry.execute(ctx(["VIEWER"]), {
      id: "c-viewer-cash",
      name: "get_cash_position",
      argumentsJson: "{}",
    });
    assert.equal(res.isError, true);
    const body = JSON.parse(res.content) as { error?: string; code?: string };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.error, AI_DENY_MESSAGES.TREASURY);
    assert.ok(!/balance|accountCount|ARS|USD|banco/i.test(res.content));
  });

  it("SITE_FOREMAN can see PR path via PURCHASE_REQUESTS but not cash", () => {
    const names = registry
      .definitions({ risks: ["READ"], ctx: ctx(["SITE_FOREMAN"]), logAdvertise: false })
      .map((t) => t.name);
    assert.ok(!names.includes("get_cash_position"));
    assert.equal(aiCanViewTreasury(["SITE_FOREMAN"]), false);
    assert.equal(aiCanViewProcurement(["SITE_FOREMAN"]), true);
  });
});

describe("Bloqer AI secondary execute defense", () => {
  const registry = createDefaultBloqerAiToolRegistry();

  it("direct invoke get_cash_position as PM is DENY with treasury message (no balances)", async () => {
    const res = await registry.execute(ctx(["PROJECT_MANAGER"]), {
      id: "c1",
      name: "get_cash_position",
      argumentsJson: "{}",
    });
    assert.equal(res.isError, true);
    const body = JSON.parse(res.content) as { error?: string; code?: string; data?: unknown };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.error, AI_DENY_MESSAGES.TREASURY);
    assert.equal(body.data, undefined);
    assert.ok(!/balance|accountCount|ARS|USD/i.test(res.content));
  });

  it("unknown tool name is DENY without leaking registry", async () => {
    const res = await registry.execute(ctx(["OWNER"]), {
      id: "c2",
      name: "get_secret_admin_dump",
      argumentsJson: "{}",
    });
    assert.equal(res.isError, true);
    assert.match(res.content, /FORBIDDEN|no disponible/i);
  });

  it("company payables without project as PM is DENY (no soft leak)", async () => {
    const res = await registry.execute(ctx(["PROJECT_MANAGER"]), {
      id: "c3",
      name: "get_payables",
      argumentsJson: "{}",
    });
    assert.equal(res.isError, true);
    const body = JSON.parse(res.content) as { error?: string; code?: string };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.error, AI_DENY_MESSAGES.COMPANY_AP);
  });
});

describe("preferredFirstName (session-derived)", () => {
  it("extracts first name from display name", () => {
    assert.equal(preferredFirstName("Simón Bravin"), "Simón");
    assert.equal(preferredFirstName("María"), "María");
  });
  it("rejects emails and empty", () => {
    assert.equal(preferredFirstName("simon@bloqer.app"), null);
    assert.equal(preferredFirstName(""), null);
    assert.equal(preferredFirstName(undefined), null);
  });
});

describe("field minimization", () => {
  it("aging top drops contactId / invoiceId", () => {
    const m = minimizeAgingTopItem({
      contactName: "Proveedor SA",
      projectName: "Obra",
      invoiceNumber: 12,
      dueDate: "2026-01-01",
      daysOverdue: 5,
      balanceDue: "100.00",
      currency: "ARS",
      status: "OPEN",
    });
    assert.equal(m.contactName, "Proveedor SA");
    assert.ok(!("contactId" in m));
    assert.ok(!("invoiceId" in m));
  });

  it("notes are truncated", () => {
    const long = "x".repeat(500);
    const n = minimizeNotes(long, 50);
    assert.ok(n && n.length <= 51);
  });
});
