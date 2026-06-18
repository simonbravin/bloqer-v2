import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { pushMoneyKpi, pushSignedNetMoneyKpi } from "../dashboard/kpi-helpers";
import { resolveEffectiveInceptionDate } from "./project-attributed-cash.service";
import { buildTreasuryAttributionKpis } from "../treasury/treasury-attribution.service";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";

describe("resolveEffectiveInceptionDate", () => {
  it("uses first movement when it precedes scheduled startDate", () => {
    const base = {
      date: new Date("2026-06-01T00:00:00.000Z"),
      source: "startDate" as const,
    };
    const result = resolveEffectiveInceptionDate(base, new Date("2026-05-15T00:00:00.000Z"));
    assert.equal(result.source, "firstMovement");
    assert.equal(result.date.toISOString().slice(0, 10), "2026-05-15");
  });

  it("keeps scheduled start when no earlier movement exists", () => {
    const base = {
      date: new Date("2026-01-01T00:00:00.000Z"),
      source: "startDate" as const,
    };
    const result = resolveEffectiveInceptionDate(base, new Date("2026-02-01T00:00:00.000Z"));
    assert.equal(result.source, "startDate");
    assert.equal(result.date.toISOString().slice(0, 10), "2026-01-01");
  });
});

describe("pushMoneyKpi", () => {
  it("does not mark monthly expenses as success when positive", () => {
    const kpis: DashboardKpi[] = [];
    const map = new Map<string, Prisma.Decimal>();
    map.set("ARS", new Prisma.Decimal("88550"));
    pushMoneyKpi(
      kpis,
      "treasury_monthly_expenses",
      "Gastos del mes",
      map,
      "/tesoreria/reportes/flujo-caja",
      "$ 0,00",
    );
    assert.equal(kpis.length, 1);
    assert.equal(kpis[0]?.tone, "default");
  });

  it("marks treasury balance as success when positive", () => {
    const kpis: DashboardKpi[] = [];
    const map = new Map<string, Prisma.Decimal>();
    map.set("ARS", new Prisma.Decimal("124911450"));
    pushMoneyKpi(kpis, "treasury_balance", "Saldo tesorería", map, "/tesoreria");
    assert.equal(kpis[0]?.tone, "success");
  });
});

describe("pushSignedNetMoneyKpi", () => {
  it("shows negative net balances with danger tone", () => {
    const kpis: DashboardKpi[] = [];
    const map = new Map<string, Prisma.Decimal>();
    map.set("ARS", new Prisma.Decimal("-350"));
    pushSignedNetMoneyKpi(kpis, "pf_cash_net", "Caja imputada", map, "/test", "Sin movimientos");
    assert.equal(kpis.length, 1);
    assert.equal(kpis[0]?.tone, "danger");
    assert.ok(kpis[0]?.value.includes("350"));
  });
});

describe("buildTreasuryAttributionKpis", () => {
  it("builds project and corporate outflow KPIs per currency", () => {
    const kpis = buildTreasuryAttributionKpis({
      visible: true,
      byCurrency: [
        {
          currency: "ARS",
          projectOutflows: "350",
          corporateOutflows: "100",
          projectInflows: "500",
          corporateInflows: "0",
        },
      ],
    });
    assert.equal(kpis.length, 2);
    const project = kpis.find((k) => k.key === "tr_attr_project_out");
    const corp = kpis.find((k) => k.key === "tr_attr_corp_out");
    assert.ok(project?.value.includes("350"));
    assert.ok(corp?.value.includes("100"));
  });

  it("returns empty when no visible data", () => {
    assert.deepEqual(buildTreasuryAttributionKpis({ visible: false, byCurrency: [] }), []);
  });
});

describe("project attributed cash net", () => {
  it("computes net as inflows minus outflows", () => {
    const inf = new Prisma.Decimal("500");
    const out = new Prisma.Decimal("350");
    const net = inf.minus(out);
    assert.equal(net.toString(), "150");
    assert.equal(net.lessThan(0), false);
  });
});
