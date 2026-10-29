import assert from "node:assert/strict";
import test from "node:test";
import { formatProjectProgressChartAmount } from "./project-progress-chart-format";

test("progress chart tooltips retain cents beyond safe numeric chart precision", () => {
  assert.equal(
    formatProjectProgressChartAmount("invoicedValue", { invoiced: "90071992547409.91" }, "ARS"),
    "90.071.992.547.409,91 ARS",
  );
});

test("missing chart values remain unavailable while an explicit zero is displayed", () => {
  assert.equal(formatProjectProgressChartAmount("invoicedValue", { invoiced: null }, "ARS"), "—");
  assert.equal(formatProjectProgressChartAmount("unknown", {}, "ARS"), "—");
  assert.match(
    formatProjectProgressChartAmount("collectedValue", { collected: "0.00" }, "ARS"),
    /0,00/,
  );
});
