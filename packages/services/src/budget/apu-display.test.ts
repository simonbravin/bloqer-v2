import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isLumpApuDisplay,
  linePartidaMoney,
  resourceQtyDisplay,
} from "@bloqer/domain";

describe("resourceQtyDisplay / lump", () => {
  it("recurso con partidaQuantity muestra 500", () => {
    const d = resourceQtyDisplay(
      {
        coefficient: 1.2821,
        unitCost: 6000,
        totalCost: 7692.3077,
        partidaQuantity: 500,
        isLumpSum: false,
      },
      390,
    );
    assert.equal(d.kind, "resource");
    if (d.kind === "resource") assert.equal(d.qty, 500);
  });

  it("isLumpSum → lump (no 1×qty como recurso)", () => {
    assert.equal(
      isLumpApuDisplay({ isLumpSum: true }),
      true,
    );
    const d = resourceQtyDisplay(
      {
        coefficient: 1,
        unitCost: 1388.8889,
        totalCost: 1388.8889,
        partidaQuantity: 1,
        isLumpSum: true,
      },
      900,
    );
    assert.equal(d.kind, "lump");
  });

  it("unit mode coef=1 sin partidaQuantity → 1×qty (rendimiento), no lump", () => {
    assert.equal(
      isLumpApuDisplay({ isLumpSum: false }),
      false,
    );
    const d = resourceQtyDisplay(
      {
        coefficient: 1,
        unitCost: 2800,
        totalCost: 2800,
        partidaQuantity: null,
        isLumpSum: false,
      },
      390,
    );
    assert.equal(d.kind, "resource");
    if (d.kind === "resource") assert.equal(d.qty, 390);
  });

  it("unit mode coef≠1 sin partidaQuantity → coef×qty", () => {
    const d = resourceQtyDisplay(
      {
        coefficient: 2,
        unitCost: 100,
        totalCost: 200,
        partidaQuantity: null,
        isLumpSum: false,
      },
      10,
    );
    assert.equal(d.kind, "resource");
    if (d.kind === "resource") assert.equal(d.qty, 20);
  });
});

describe("linePartidaMoney", () => {
  it("usa totalCost × qty (única fuente)", () => {
    assert.equal(linePartidaMoney(7692.3077, 390), 7692.3077 * 390);
    assert.equal(linePartidaMoney(100, 0), 0);
  });
});
