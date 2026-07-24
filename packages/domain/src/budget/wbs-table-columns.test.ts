import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wbsMoneyColumnCount, wbsTableColumnCount, type WbsTableViewMode } from "./wbs-table-columns";

describe("wbsTableColumnCount", () => {
  it("cost breakdown → 10 columns", () => {
    const mode: WbsTableViewMode = { base: "cost", scale: "total", detail: "breakdown" };
    assert.equal(wbsMoneyColumnCount(mode), 5);
    assert.equal(wbsTableColumnCount(mode), 10);
  });

  it("cost compact → 6 columns", () => {
    const mode: WbsTableViewMode = { base: "cost", scale: "unit", detail: "compact" };
    assert.equal(wbsMoneyColumnCount(mode), 1);
    assert.equal(wbsTableColumnCount(mode), 6);
  });

  it("sale → 6 columns (detail ignored)", () => {
    const mode: WbsTableViewMode = { base: "sale", scale: "total", detail: "breakdown" };
    assert.equal(wbsMoneyColumnCount(mode), 1);
    assert.equal(wbsTableColumnCount(mode), 6);
  });

  it("incidencia suma 1 columna antes de acciones", () => {
    const mode: WbsTableViewMode = {
      base: "cost",
      scale: "total",
      detail: "breakdown",
      showIncidence: true,
    };
    assert.equal(wbsTableColumnCount(mode), 11);
  });
});
