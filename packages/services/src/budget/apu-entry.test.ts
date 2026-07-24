import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canUseTotalPartidaMode,
  convertApuEntryMode,
  lineUnitTotal,
  physicalNeedQty,
  normalizeStoredApuLineForItemQuantity,
  previewApuEntry,
  recomputeLumpForItemQuantity,
  recomputeResourceForItemQuantity,
  roundApuDecimal,
  toEntryApuLine,
  toStoredApuLine,
} from "@bloqer/domain";

describe("toStoredApuLine", () => {
  it("monto global en total partida → coef 1 y unitCost prorrateado (money-safe)", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "lump",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    assert.equal(stored.coefficient, 1);
    assert.equal(stored.isLumpSum, true);
    assert.equal(stored.partidaQuantity, 1);
    assert.equal(stored.totalCost, roundApuDecimal(1_250_000 / 900));
    const partida = stored.totalCost * 900;
    assert.ok(Math.abs(partida - 1_250_000) < 1, `partida=${partida}`);
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
    assert.equal(stored.partidaQuantity, null);
    assert.equal(stored.isLumpSum, false);
    assert.equal(lineUnitTotal(stored, stored.totalCost), 2800);
  });

  it("500 hierros en total recurso → preserva cant física y precio", () => {
    const price = 6000;
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "resource",
      coefficient: 500,
      unitCost: price,
      itemQuantity: 390,
    });
    assert.equal(stored.partidaQuantity, 500);
    assert.equal(stored.unitCost, price);
    assert.equal(stored.isLumpSum, false);
    assert.equal(stored.coefficient, roundApuDecimal(500 / 390));
    assert.equal(stored.totalCost, roundApuDecimal((500 * price) / 390));
    assert.equal(physicalNeedQty(stored.partidaQuantity, stored.coefficient, 390), 500);
    const partida = stored.totalCost * 390;
    assert.ok(Math.abs(partida - 500 * price) < 1, `partida=${partida}`);
  });

  it("qty ítem 0 en modo total no divide (queda como unidad)", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "resource",
      coefficient: 500,
      unitCost: 6000,
      itemQuantity: 0,
    });
    assert.equal(stored.coefficient, 500);
    assert.equal(stored.unitCost, 6000);
    assert.equal(stored.partidaQuantity, null);
  });

  it("no pierde miles por Decimal(18,4) al prorratear global 1/900 en coeficiente", () => {
    const badCoef = roundApuDecimal(1 / 900);
    assert.equal(badCoef, 0.0011);
    const badPartida = badCoef * 1_250_000 * 900;
    assert.ok(Math.abs(badPartida - 1_250_000) > 1000);

    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "lump",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    assert.notEqual(stored.coefficient, badCoef);
    assert.equal(stored.coefficient, 1);
  });
});

describe("toEntryApuLine", () => {
  it("reverse de total recurso restaura cant y precio", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "resource",
      coefficient: 500,
      unitCost: 6000,
      itemQuantity: 390,
    });
    const entry = toEntryApuLine({
      mode: "total",
      ...stored,
      itemQuantity: 390,
    });
    assert.equal(entry.totalKind, "resource");
    assert.equal(entry.coefficient, 500);
    assert.equal(entry.unitCost, 6000);
  });

  it("reverse de monto global restaura importe de obra", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "lump",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    const entry = toEntryApuLine({
      mode: "total",
      ...stored,
      itemQuantity: 900,
    });
    assert.equal(entry.totalKind, "lump");
    assert.equal(entry.coefficient, 1);
    assert.ok(Math.abs(entry.unitCost - 1_250_000) < 2);
  });
});

describe("convertApuEntryMode", () => {
  it("unit → total recurso conserva necesidad × precio", () => {
    const unit = { coefficient: 1.2821, unitCost: 6000 };
    const total = convertApuEntryMode("unit", "total", unit, 390, "resource");
    assert.equal(total.coefficient, roundApuDecimal(1.2821 * 390));
    assert.equal(total.unitCost, 6000);
    const back = convertApuEntryMode("total", "unit", total, 390, "resource");
    assert.equal(back.coefficient, roundApuDecimal(total.coefficient / 390));
    assert.equal(back.unitCost, 6000);
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

  it("modo total recurso muestra rendimiento derivado", () => {
    const p = previewApuEntry({
      mode: "total",
      totalKind: "resource",
      coefficient: 500,
      unitCost: 6000,
      itemQuantity: 390,
    });
    assert.equal(p.partidaTotal, 500 * 6000);
    assert.equal(p.resourceNeed, 500);
    assert.ok(p.yieldPerItemUnit != null);
    assert.ok(Math.abs((p.yieldPerItemUnit ?? 0) - 500 / 390) < 1e-9);
  });
});

describe("recompute on item qty change", () => {
  it("recurso mantiene 500 un al cambiar ml", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "resource",
      coefficient: 500,
      unitCost: 6000,
      itemQuantity: 390,
    });
    const next = recomputeResourceForItemQuantity(stored, 400);
    assert.equal(next.partidaQuantity, 500);
    assert.equal(next.unitCost, 6000);
    assert.equal(physicalNeedQty(next.partidaQuantity, next.coefficient, 400), 500);
  });

  it("lump mantiene dinero de partida al cambiar qty", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "lump",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    const partidaMoney = stored.totalCost * 900;
    const next = recomputeLumpForItemQuantity(partidaMoney, 450);
    assert.equal(next.isLumpSum, true);
    assert.equal(next.coefficient, 1);
    assert.ok(Math.abs(next.totalCost * 450 - 1_250_000) < 1);
  });
});

describe("normalizeStoredApuLineForItemQuantity", () => {
  it("recurso recalcula totalCost desde partidaQuantity (idempotente)", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "resource",
      coefficient: 500,
      unitCost: 6000,
      itemQuantity: 390,
    });
    const stale = { ...stored, totalCost: 1, coefficient: 0.01 };
    const next = normalizeStoredApuLineForItemQuantity(stale, 400);
    assert.equal(next.partidaQuantity, 500);
    assert.equal(next.unitCost, 6000);
    assert.equal(next.totalCost, roundApuDecimal((500 * 6000) / 400));
  });

  it("lump conserva dinero si totalCost ya es aporte unitario de la qty nueva", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "lump",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    const atNewQty = recomputeLumpForItemQuantity(stored.totalCost * 900, 450);
    const next = normalizeStoredApuLineForItemQuantity(atNewQty, 450);
    assert.ok(Math.abs(next.totalCost * 450 - 1_250_000) < 1);
  });

  it("lump con qty ≤ 0 no colapsa el aporte (no-op)", () => {
    const stored = toStoredApuLine({
      mode: "total",
      totalKind: "lump",
      coefficient: 1,
      unitCost: 1_250_000,
      itemQuantity: 900,
    });
    const next = normalizeStoredApuLineForItemQuantity(stored, 0);
    assert.equal(next.totalCost, stored.totalCost);
    assert.equal(next.isLumpSum, true);
  });
});

describe("canUseTotalPartidaMode", () => {
  it("requiere cantidad de ítem > 0", () => {
    assert.equal(canUseTotalPartidaMode(900), true);
    assert.equal(canUseTotalPartidaMode(0), false);
    assert.equal(canUseTotalPartidaMode(-1), false);
  });
});
