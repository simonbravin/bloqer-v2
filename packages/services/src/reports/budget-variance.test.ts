import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCostVarianceLayer } from "./budget-variance.service";

describe("parseCostVarianceLayer", () => {
  it("defaults to exposure", () => {
    assert.equal(parseCostVarianceLayer(undefined), "exposure");
    assert.equal(parseCostVarianceLayer("invalid"), "exposure");
  });

  it("accepts valid layers", () => {
    assert.equal(parseCostVarianceLayer("committed"), "committed");
    assert.equal(parseCostVarianceLayer("accrued"), "accrued");
    assert.equal(parseCostVarianceLayer("paid"), "paid");
  });
});
