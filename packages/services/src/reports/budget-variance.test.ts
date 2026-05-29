import { describe, expect, it } from "vitest";
import { parseCostVarianceLayer } from "./budget-variance.service";

describe("parseCostVarianceLayer", () => {
  it("defaults to exposure", () => {
    expect(parseCostVarianceLayer(undefined)).toBe("exposure");
    expect(parseCostVarianceLayer("invalid")).toBe("exposure");
  });

  it("accepts valid layers", () => {
    expect(parseCostVarianceLayer("committed")).toBe("committed");
    expect(parseCostVarianceLayer("accrued")).toBe("accrued");
    expect(parseCostVarianceLayer("paid")).toBe("paid");
  });
});
