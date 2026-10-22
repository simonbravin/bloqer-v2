import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateJobsiteProgress,
  parseMeasurementPhysicalPct,
  parseMeasurementQty,
  suggestPeriodCertQty,
  suggestPeriodPhysicalPct,
  suggestCertificationFromProgress,
  suggestPendingPhysicalPct,
  previewCertificationMeasurement,
} from "./certification-measurement-pure";

test("suggestPeriodCertQty caps the period log at the contractual remainder", () => {
  assert.equal(suggestPeriodCertQty("15", "75"), "15.0000");
  assert.equal(suggestPeriodCertQty("80", "75"), "75.0000");
});

test("cumulative progress suggests only the unbilled difference across certificates", () => {
  assert.deepEqual(
    suggestCertificationFromProgress({
      progressPct: "37",
      budgetQty: "100",
      previousQty: "12",
      unitSalePrice: "73.6454",
    }),
    {
      quantity: "25.0000",
      percentage: "25.0000",
      amount: "1841.14",
    },
  );
  assert.equal(suggestPendingPhysicalPct("37", "12"), "25.0000");
  assert.equal(
    suggestCertificationFromProgress({
      progressPct: "37",
      budgetQty: "100",
      previousQty: "37",
      unitSalePrice: "73.6454",
    })?.quantity,
    "0.0000",
  );
});

test("suggestions distinguish missing data from zero and cap legacy progress", () => {
  const base = { budgetQty: "1", previousQty: "0.75", unitSalePrice: "7364547.72" };
  assert.equal(suggestCertificationFromProgress({ ...base, progressPct: null }), null);
  assert.equal(suggestCertificationFromProgress({ ...base, progressPct: "0" })?.quantity, "0.0000");
  assert.equal(
    suggestCertificationFromProgress({ ...base, progressPct: "150" })?.quantity,
    "0.2500",
  );
  assert.equal(
    suggestCertificationFromProgress({ ...base, budgetQty: "0", progressPct: "20" }),
    null,
  );
  assert.equal(suggestPendingPhysicalPct("150", "98.1234"), "1.8766");
  assert.equal(suggestPendingPhysicalPct("40", "45"), "0.0000");
});

test("physical percentage and economic quantity remain independent in the preview", () => {
  const value = previewCertificationMeasurement({
    currentQty: "0.25",
    previousQty: "0.12",
    budgetQty: "1",
    unitSalePrice: "7364547.72",
    physicalPct: "0",
    previousPhysicalPct: "12",
  });
  assert.equal(value.periodAmount, "1841136.93");
  assert.equal(value.cumulativePct, "37.0000");
  assert.equal(value.cumulativePhysicalPct, "12");
  assert.equal(value.remainingQty, "0.6300");
  assert.equal(value.overQuantity, false);
  assert.equal(value.overPhysical, false);
});

test("preview detects overcertification at 4 dp without floating point rounding", () => {
  const value = previewCertificationMeasurement({
    currentQty: "0.0001",
    previousQty: "1",
    budgetQty: "1",
    unitSalePrice: "100",
    physicalPct: "0.0001",
    previousPhysicalPct: "100",
  });
  assert.equal(value.overQuantity, true);
  assert.equal(value.overPhysical, true);
  assert.equal(value.periodAmount, "0.01");
});

test("historical measurements exclude approved logs after the end date", () => {
  const totals = aggregateJobsiteProgress(
    [
      { wbsNodeId: "wbs", logDate: "2026-09-10", quantityCompleted: "0.5", physicalPct: "50" },
      { wbsNodeId: "wbs", logDate: "2026-09-11", quantityCompleted: "0.5", physicalPct: "50" },
    ],
    "2026-09-01",
    "2026-09-10",
  ).get("wbs")!;
  assert.equal(totals.qtyAcum, "0.5000");
  assert.equal(totals.pctAcum, "50.0000");
  assert.equal(totals.hasPhysicalPct, true);
  assert.equal(totals.hasProgress, true);
});

test("suggestPeriodCertQty is empty when the period log or the remainder is zero", () => {
  assert.equal(suggestPeriodCertQty("0", "75"), null);
  assert.equal(suggestPeriodCertQty("10", "0"), null);
});

test("suggestPeriodPhysicalPct clamps a legacy sum above 100", () => {
  assert.equal(suggestPeriodPhysicalPct("12.5"), "12.50");
  assert.equal(suggestPeriodPhysicalPct("140"), "100.00");
  assert.equal(suggestPeriodPhysicalPct("0"), null);
});

test("aggregateJobsiteProgress keeps logs outside the certificate period out of the period totals", () => {
  const totals = aggregateJobsiteProgress(
    [
      {
        wbsNodeId: "wbs-1",
        logDate: "2026-08-20",
        quantityCompleted: "25",
        physicalPct: "10",
      },
      {
        wbsNodeId: "wbs-1",
        logDate: "2026-09-15T00:00:00.000Z",
        quantityCompleted: "15",
        physicalPct: "8",
      },
    ],
    "2026-09-01",
    "2026-09-30",
  );
  const row = totals.get("wbs-1");
  assert.ok(row);
  assert.equal(row.qtyAcum, "40.0000");
  assert.equal(row.pctAcum, "18.0000");
  assert.equal(row.qtyPeriod, "15.0000");
  assert.equal(row.pctPeriod, "8.0000");
});

test("parseMeasurementQty rejects zero and keeps a 4 dp string", () => {
  assert.equal(parseMeasurementQty("0"), null);
  assert.equal(parseMeasurementQty(""), null);
  assert.equal(parseMeasurementQty("no"), null);
  assert.equal(parseMeasurementQty("10.0001"), "10.0001");
});

test("parseMeasurementPhysicalPct rejects values above 100 and treats empty as zero", () => {
  assert.equal(parseMeasurementPhysicalPct(""), "0.0000");
  assert.equal(parseMeasurementPhysicalPct("12.5"), "12.5000");
  assert.equal(parseMeasurementPhysicalPct("140"), null);
});
