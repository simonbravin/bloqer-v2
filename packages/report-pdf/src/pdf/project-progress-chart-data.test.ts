import assert from "node:assert/strict";
import test from "node:test";
import { projectProgressExportFixture } from "./project-progress-pdf.fixture";
import {
  buildProgressCommercialSeries,
  projectProgressBarGeometry,
} from "./project-progress-chart-data";

test("PDF commercial curves preserve valid history and gaps at an incomplete final cut", () => {
  const report = projectProgressExportFixture();
  report.financial.invoiced = report.financial.collected = null;
  report.series.at(-1)!.invoiced = report.series.at(-1)!.collected = null;
  const curves = buildProgressCommercialSeries(report.series, {
    certified: "blue",
    invoiced: "gray",
    collected: "green",
  });
  assert.deepEqual(curves.find((curve) => curve.name === "Facturado")?.values, [
    "2420000.00",
    "4840000.00",
    "7260000.00",
    null,
  ]);
  assert.equal(
    buildProgressCommercialSeries([], { certified: "blue", invoiced: "gray", collected: "green" })
      .length,
    0,
  );
});

test("PDF bars preserve negative/positive directions relative to zero", () => {
  const { zeroX, segments } = projectProgressBarGeometry([-20, 100, 0], 460);
  assert.ok(segments[0]!.x + segments[0]!.width <= zeroX);
  assert.ok(segments[0]!.width > 0);
  assert.ok(segments[1]!.x >= zeroX);
  assert.equal(segments[2]!.width, 0);
  assert.equal(projectProgressBarGeometry([100], 460).zeroX, 0);
});
