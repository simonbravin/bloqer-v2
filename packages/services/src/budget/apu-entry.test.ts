import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canUseTotalPartidaMode,
  convertApuEntryMode,
  lineUnitTotal,
  previewApuEntry,
  roundApuDecimal,
  toEntryApuLine,
  toStoredApuLine,
} from "@bloqer/domain";

describe("toStoredApuLine", () => {
  it("global materiales en total partida → coef 1 y unitCost prorrateado (money-safe)", () => {
    const stored = toStoredApuLine({
      mode: "total",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    assert.equal(stored.coefficient, 1);
    assert.equal(stored.unitCost, roundApuDecimal(1_250_000 / 900));
    const partida = lineUnitTotal(stored) * 900;
    assert.ok(Math.abs(partida - 1_250_000) < 0.1, `partida=${partida}`);
  });

  it("MO por m² en modo unidad no convierte el coeficiente", () => {
    const stored = toStoredApuLine({
      mode: "unit",
      coefficient: 1,
      unitCost: 2800,
      itemQuantity: 900,
    });
    assert.equal(stored.coefficient, 1);
    assert.equal(stored.unitCost, 2800);
    assert.equal(lineUnitTotal(stored), 2800);
  });

  it("500 bolsas en total partida → 1 × (500×P)/900", () => {
    const price = 1000;
    const stored = toStoredApuLine({
      mode: "total",
      coefficient: 500,
      unitCost: price,
      itemQuantity: 900,
    });
    assert.equal(stored.coefficient, 1);
    assert.equal(stored.unitCost, roundApuDecimal((500 * price) / 900));
    const partida = lineUnitTotal(stored) * 900;
    assert.ok(Math.abs(partida - 500 * price) < 0.1, `partida=${partida}`);
  });

  it("qty ítem 0 en modo total no divide (queda como entrada redondeada)", () => {
    const stored = toStoredApuLine({
      mode: "total",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 0,
    });
    assert.equal(stored.coefficient, 1);
    assert.equal(stored.unitCost, 1_250_000);
  });

  it("no pierde miles por Decimal(18,4) al prorratear 1/900 en coeficiente", () => {
    // Anti-regresión: coef 1/900 redondeado a 4 dp = 0.0011 → error ~12.500 en partida
    const badCoef = roundApuDecimal(1 / 900);
    assert.equal(badCoef, 0.0011);
    const badPartida = badCoef * 1_250_000 * 900;
    assert.ok(Math.abs(badPartida - 1_250_000) > 1000);

    const stored = toStoredApuLine({
      mode: "total",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    assert.notEqual(stored.coefficient, badCoef);
  });
});

describe("toEntryApuLine", () => {
  it("reverse de total partida restaura el importe de obra", () => {
    const stored = toStoredApuLine({
      mode: "total",
      coefficient: 500,
      unitCost: 1000,
      itemQuantity: 900,
    });
    const entry = toEntryApuLine({
      mode: "total",
      ...stored,
      itemQuantity: 900,
    });
    assert.equal(entry.coefficient, 1);
    assert.ok(Math.abs(entry.unitCost - 500_000) < 0.1);
  });
});

describe("convertApuEntryMode", () => {
  it("unit → total → unit conserva el total de partida", () => {
    const unit = { coefficient: 1, unitCost: 2800 };
    const total = convertApuEntryMode("unit", "total", unit, 900);
    assert.equal(total.coefficient, 1);
    assert.equal(total.unitCost, 2800 * 900);
    const back = convertApuEntryMode("total", "unit", total, 900);
    assert.equal(back.coefficient, 1);
    assert.equal(back.unitCost, 2800);
  });
});

describe("previewApuEntry", () => {
  it("modo unidad muestra total partida escalado", () => {
    const p = previewApuEntry({
      mode: "unit",
      coefficient: 1,
      unitCost: 2800,
      itemQuantity: 900,
    });
    assert.equal(p.unitTotal, 2800);
    assert.equal(p.partidaTotal, 2800 * 900);
  });

  it("modo total muestra unitario prorrateado", () => {
    const p = previewApuEntry({
      mode: "total",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    assert.equal(p.partidaTotal, 1_250_000);
    assert.ok(Math.abs(p.unitTotal - 1_250_000 / 900) < 1e-9);
  });
});

describe("canUseTotalPartidaMode", () => {
  it("requiere cantidad de ítem > 0", () => {
    assert.equal(canUseTotalPartidaMode(900), true);
    assert.equal(canUseTotalPartidaMode(0), false);
    assert.equal(canUseTotalPartidaMode(-1), false);
  });
});
