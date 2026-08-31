import test from "node:test";
import assert from "node:assert/strict";
import { buildStyledScheduleXlsx } from "./schedule-xlsx-styled";
import type { ScheduleExportPayload } from "./schedule-export-pure";

const payload: ScheduleExportPayload = {
  projectId: "p1",
  budgetName: "Base",
  budgetCurrency: "ARS",
  filterLine: "Estado: Activos (sin canceladas)",
  view: "both",
  orgLine: "Empresa Demo · Tenant",
  projectLabel: "OBR-01 · Torre",
  generatedAtIso: "2026-08-31T12:00:00.000Z",
  summaryLine: "2 ítems",
  rows: [
    {
      id: "t1",
      displayName: "Losas",
      typeLabel: "Tarea",
      type: "TASK",
      isLeaf: true,
      isMilestone: false,
      statusLabel: "En curso",
      wbsCode: "1.1",
      startDate: "2026-03-01",
      endDate: "2026-03-20",
      startLabel: "01/03/2026",
      endLabel: "20/03/2026",
      durationLabel: "20 días",
      realPct: "40,00%",
      planPct: "50,00%",
      qtyPct: "—",
      certPct: "—",
      budgetLabel: "100,00 ARS",
      committedLabel: "10,00 ARS",
      alerts: "Atrasado 2d",
      treeDepth: 0,
      barColor: "#ef4444",
      progressRatio: 0.4,
    },
  ],
  gantt: {
    rangeStartIso: "2026-02-22",
    rangeEndIso: "2026-03-27",
    todayIso: "2026-03-10",
    todayLeft: 0.4,
    axisTicks: [],
    scale: "weekly",
    periods: [
      { key: "w1", label: "02/03/2026", startIso: "2026-03-02", endIso: "2026-03-08" },
      { key: "w2", label: "09/03/2026", startIso: "2026-03-09", endIso: "2026-03-15" },
    ],
  },
};

test("styled schedule xlsx is a zip with fills", () => {
  const buf = buildStyledScheduleXlsx(payload);
  assert.equal(buf.subarray(0, 2).toString("utf8"), "PK");
  const asText = buf.toString("utf8");
  assert.match(asText, /patternType="solid"/);
  assert.match(asText, /FFEF4444/);
  assert.match(asText, /dd\/mm\/yyyy/);
  assert.match(asText, /<sheet name="Tabla"/);
  assert.match(asText, /<sheet name="Gantt"/);
});
