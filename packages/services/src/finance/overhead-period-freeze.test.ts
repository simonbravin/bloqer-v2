import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { computeWeightShare } from "./overhead-period";

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
