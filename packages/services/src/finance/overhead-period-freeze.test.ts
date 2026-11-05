import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { computeWeightShare } from "./overhead-period";
import { getAutoWeightOverheadPreviewForPeriod } from "./overhead-auto-weight.service";
import { createProjectOverheadAllocation, updateCompanyOverheadAllocationMode, updateCompanyOverheadAllocationPct } from "./project-overhead.service";
import { ServiceError, type ServiceContext } from "../types";
import { verifiedDocumentAmountArs } from "./fx-amount.service";

/**
 * Regresión D-043: peso congelado debe ser estable (helper usado al cerrar período).
 * Live OPEN allocation must use the same excludeDraftProjects rule as close/preview
 * (see sumAutoWeightOverheadForProject → AUTO_WEIGHT_PERIOD_CLOSE_OPTS).
 */
test("computeWeightShare matches auto-weight allocation ratio", () => {
  const cdProject = new Prisma.Decimal(300);
  const cdTotal = new Prisma.Decimal(1000);
  const pool = new Prisma.Decimal(10000);
  const weight = new Prisma.Decimal(computeWeightShare(cdProject.toFixed(2), cdTotal.toFixed(2)));
  const allocated = pool.mul(cdProject).div(cdTotal);
  assert.equal(allocated.toFixed(2), "3000.00");
  assert.equal(weight.toFixed(2), "30.00");
});

test("AUTO_WEIGHT_PERIOD_CLOSE_OPTS excludes draft projects", async () => {
  const { AUTO_WEIGHT_PERIOD_CLOSE_OPTS } = await import("./overhead-auto-weight.service");
  assert.equal(AUTO_WEIGHT_PERIOD_CLOSE_OPTS.excludeDraftProjects, true);
});

test("overhead reads and settings changes reject a company outside the session", async () => {
  const ctx: ServiceContext = { tenantId: "tenant", companyId: "home", actorUserId: "owner", roles: ["OWNER"] };
  const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";
  await assert.rejects(() => getAutoWeightOverheadPreviewForPeriod("other", "2026-11", ctx), forbidden);
  await assert.rejects(() => updateCompanyOverheadAllocationMode("other", "AUTO_WEIGHT", ctx), forbidden);
  await assert.rejects(() => updateCompanyOverheadAllocationPct("other", 10, ctx), forbidden);
  await assert.rejects(() => createProjectOverheadAllocation({ companyId: "other", projectId: "work", period: "2026-11", amount: "10.00" }, ctx), forbidden);
});

test("D-142 uses stored gross equivalent to verify FX before converting net costs", () => {
  const row = { currency: "USD", totalAmount: new Prisma.Decimal("121"), fxRate: new Prisma.Decimal("1250"), amountArs: new Prisma.Decimal("151250") };
  const net = new Prisma.Decimal("100");
  assert.equal(verifiedDocumentAmountArs(row, net)?.toFixed(2), "125000.00");
  assert.equal(verifiedDocumentAmountArs({ ...row, amountArs: new Prisma.Decimal("0") }, net), null);
  assert.equal(verifiedDocumentAmountArs({ ...row, fxRate: new Prisma.Decimal("0") }, net), null);
  assert.equal(verifiedDocumentAmountArs({ ...row, totalAmount: new Prisma.Decimal("0"), amountArs: new Prisma.Decimal("0") }, net), null);
  assert.equal(verifiedDocumentAmountArs({ ...row, currency: "ars " }, net)?.toFixed(2), "100.00");
});
