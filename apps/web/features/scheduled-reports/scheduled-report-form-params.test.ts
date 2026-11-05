import assert from "node:assert/strict";
import test from "node:test";

import { buildScheduledReportFormParams } from "./scheduled-report-form-params";

const project = { scope: "PROJECT", projectId: "obra-a" } as const;
const emptyFilters = { dateFrom: "", dateTo: "", currency: "", jobsiteProjectIds: [] };

test("editing a schedule retains untouched filters and clears visible filters left empty", () => {
  const initial = { ...project, params: { budgetId: "budget-a", dateTo: "2026-10-30", currency: "USD" } };
  assert.deepEqual(
    buildScheduledReportFormParams(project, { ...emptyFilters, currency: " ARS " }, initial),
    { budgetId: "budget-a", currency: "ARS" },
  );
});

test("changing project or scope drops filters from the original selection", () => {
  const initial = { ...project, params: { budgetId: "budget-a" } };
  assert.equal(
    buildScheduledReportFormParams({ ...project, projectId: "obra-b" }, emptyFilters, initial),
    undefined,
  );
  assert.deepEqual(
    buildScheduledReportFormParams(
      { scope: "TENANT" },
      { ...emptyFilters, jobsiteProjectIds: ["obra-a", "obra-b"] },
      initial,
    ),
    { jobsiteProjectIds: "obra-a,obra-b" },
  );
});
