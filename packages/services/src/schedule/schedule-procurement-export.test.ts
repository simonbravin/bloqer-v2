import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScheduleProcurementExportRows } from "./schedule-export-pure";
import type { ScheduleItemProcurement } from "./schedule-procurement";

const procurement: ScheduleItemProcurement = {
  expectedDeliveryDate: "2026-11-28", latestReceiptDate: "2026-11-20", deliveryAfterSiblingStart: true,
  pendingLines: [{
    id: "line", purchaseOrderId: "po", purchaseOrderCode: "OC-009", wbsNodeId: "wbs", wbsCode: "1.2",
    description: "Panel", unit: "m2", quantity: "10.1234", receivedQuantity: "1.0000", remainingQuantity: "9.1234",
    expectedDeliveryDate: null,
  }],
};

test("export distinguishes task dates from an OC without promised date and preserves precise quantities", () => {
  const [row] = buildScheduleProcurementExportRows([{ id: "task", name: "Montaje", procurement }]);
  assert.equal(row!.taskExpectedDelivery, "28/11/2026");
  assert.equal(row!.expectedDelivery, "—");
  assert.equal(row!.latestReceipt, "20/11/2026");
  assert.equal(row!.remainingQuantity, "9,1234");
  assert.match(row!.warning, /tarea hermana/);
});

test("export retains receipt-only evidence and excludes unavailable procurement", () => {
  const rows = buildScheduleProcurementExportRows([
    { id: "receipt", name: "Llegada", procurement: { ...procurement, pendingLines: [] } },
    { id: "hidden", name: "No accesible", procurement: null },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.description, /Sin cantidades pendientes/);
  assert.equal(rows[0]!.remainingQuantity, "—");
});

test("export identifies restricted and inconsistent sources instead of claiming no pending quantity", () => {
  const rows = buildScheduleProcurementExportRows([
    { id: "restricted", name: "Llegada", procurement: { ...procurement, pendingLines: null } },
    { id: "partial", name: "Llegada", procurement: { ...procurement, pendingLines: [], incompleteSources: true } },
  ]);
  assert.match(rows[0]!.description, /no disponibles/);
  assert.match(rows[1]!.description, /No se pudieron comprobar/);
  assert.match(rows[1]!.warning, /Información parcial/);
});
