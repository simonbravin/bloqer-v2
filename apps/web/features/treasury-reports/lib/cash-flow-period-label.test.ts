import assert from "node:assert/strict";
import { test } from "node:test";
import { cashFlowPeriodLabel } from "./cash-flow-period-label";

test("cash flow labels keep the calendar period when the browser is west of UTC", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Argentina/Buenos_Aires";
  try {
    assert.match(cashFlowPeriodLabel("2026-11"), /^nov.*2026$/i);
    assert.equal(cashFlowPeriodLabel("2026-11-01"), "01/11/2026");
    assert.equal(cashFlowPeriodLabel("2026-W01"), "Sem. 01 · 2026");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
