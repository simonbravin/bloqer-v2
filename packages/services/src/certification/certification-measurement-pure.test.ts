import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateJobsiteProgress,
  parseMeasurementPhysicalPct,
  parseMeasurementQty,
  suggestPeriodCertQty,
  suggestPeriodPhysicalPct,
} from "./certification-measurement-pure";

test("suggestPeriodCertQty caps the period log at the contractual remainder", () => {
  assert.equal(suggestPeriodCertQty("15", "75"), "15.0000");
  assert.equal(suggestPeriodCertQty("80", "75"), "75.0000");
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
  assert.equal(row.pctAcum, "18.00");
  assert.equal(row.qtyPeriod, "15.0000");
  assert.equal(row.pctPeriod, "8.00");
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
