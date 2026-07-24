import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatWbsIncidencePercent,
  formatWbsIncidencePercentExport,
  wbsIncidencePercent,
} from "./wbs-incidence";

describe("wbsIncidencePercent", () => {
  it("calcula % sobre el total", () => {
    assert.equal(wbsIncidencePercent(300, 450), (300 / 450) * 100);
  });

  it("null si total ≤ 0", () => {
    assert.equal(wbsIncidencePercent(10, 0), null);
    assert.equal(wbsIncidencePercent(10, -1), null);
  });
});

describe("formatWbsIncidencePercent", () => {
  it("UI usa coma; export usa punto", () => {
    assert.equal(formatWbsIncidencePercent(100), "100,00%");
    assert.equal(formatWbsIncidencePercent(null), "—");
    assert.equal(formatWbsIncidencePercentExport(66.666), "66.67%");
    assert.equal(formatWbsIncidencePercentExport(null), "");
  });
});
