import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  wbsMoneyColumnCount,
  wbsShowUnit,
  wbsTableColumnCount,
  type WbsTableViewMode,
} from "./wbs-table-columns";

describe("wbsTableColumnCount", () => {
  it("cost breakdown → 10 columns (totals only)", () => {
    const mode: WbsTableViewMode = { base: "cost", detail: "breakdown", showUnit: false };
    assert.equal(wbsMoneyColumnCount(mode), 5);
    assert.equal(wbsTableColumnCount(mode), 10);
  });

  it("cost breakdown + unitario → 15 columns", () => {
    const mode: WbsTableViewMode = { base: "cost", detail: "breakdown", showUnit: true };
    assert.equal(wbsMoneyColumnCount(mode), 10);
    assert.equal(wbsTableColumnCount(mode), 15);
  });

  it("cost compact → 6 columns; + unitario → 7", () => {
    const compact: WbsTableViewMode = { base: "cost", detail: "compact", showUnit: false };
    assert.equal(wbsTableColumnCount(compact), 6);
    assert.equal(wbsTableColumnCount({ ...compact, showUnit: true }), 7);
  });

  it("sale → 6; + unitario → 7", () => {
    const mode: WbsTableViewMode = { base: "sale", detail: "compact", showUnit: false };
    assert.equal(wbsMoneyColumnCount(mode), 1);
    assert.equal(wbsTableColumnCount(mode), 6);
    assert.equal(wbsTableColumnCount({ ...mode, showUnit: true }), 7);
  });

  it("incidencia suma 1 columna", () => {
    const mode: WbsTableViewMode = {
      base: "cost",
      detail: "breakdown",
      showUnit: false,
      showIncidence: true,
    };
    assert.equal(wbsTableColumnCount(mode), 11);
  });

  it("legacy scale=unit implies showUnit", () => {
    assert.equal(wbsShowUnit({ base: "cost", detail: "compact", scale: "unit" }), true);
    assert.equal(wbsShowUnit({ base: "cost", detail: "compact", scale: "total" }), false);
  });
});
