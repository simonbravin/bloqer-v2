import test from "node:test";
import assert from "node:assert/strict";
import type { ScheduleExportPayload } from "@bloqer/services/schedule-export-pure";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { renderReportPdfToBuffer } from "./pdf-renderer.service";
import { SchedulePdfDocument } from "./schedule-pdf";

const branding: PdfReportBranding = {
  tenantName: "Tenant Demo",
  companyDisplayName: "Constructora Demo S.A.",
  projectLabel: "OBR-01 · Torre Norte",
  generatedByLabel: "Tester",
  generatedAtIso: "2026-08-31T12:00:00.000Z",
  logoDataUri: null,
};

const payload: ScheduleExportPayload = {
  projectId: "p1",
  budgetName: "Presupuesto base",
  budgetCurrency: "ARS",
  filterLine: "Presupuesto: Presupuesto base · Estado: Activos (sin canceladas)",
  view: "both",
  orgLine: "Constructora Demo S.A. · Tenant Demo",
  projectLabel: "OBR-01 · Torre Norte",
  generatedAtIso: "2026-08-31T12:00:00.000Z",
  summaryLine: "2 ítems",
  rows: [
    {
      id: "c1",
      displayName: "Estructura",
      typeLabel: "Contenedor",
      type: "TASK",
      isLeaf: false,
      isMilestone: false,
      statusLabel: "En curso",
      wbsCode: "1",
      startDate: "2026-03-01",
      endDate: "2026-04-30",
      startLabel: "01/03/2026",
      endLabel: "30/04/2026",
      durationLabel: "61 días",
      realPct: "40,00%",
      planPct: "50,00%",
      qtyPct: "—",
      certPct: "—",
      budgetLabel: "1.000.000,00 ARS",
      committedLabel: "200.000,00 ARS",
      alerts: "—",
      treeDepth: 0,
      barColor: "#475569",
      progressRatio: 0.4,
    },
    {
      id: "t1",
      displayName: "  Losas",
      typeLabel: "Tarea",
      type: "TASK",
      isLeaf: true,
      isMilestone: false,
      statusLabel: "En curso",
      wbsCode: "1.1",
      startDate: "2026-03-10",
      endDate: "2026-03-25",
      startLabel: "10/03/2026",
      endLabel: "25/03/2026",
      durationLabel: "16 días",
      realPct: "25,00%",
      planPct: "80,00%",
      qtyPct: "20,00%",
      certPct: "10,00%",
      budgetLabel: "400.000,00 ARS",
      committedLabel: "50.000,00 ARS",
      alerts: "Atrasado 4d",
      treeDepth: 1,
      barColor: "#ef4444",
      progressRatio: 0.25,
    },
    {
      id: "m1",
      displayName: "  Hito arranque",
      typeLabel: "Hito",
      type: "MILESTONE",
      isLeaf: true,
      isMilestone: true,
      statusLabel: "Planificado",
      wbsCode: "1.2",
      startDate: "2026-03-15",
      endDate: "2026-03-15",
      startLabel: "15/03/2026",
      endLabel: "15/03/2026",
      durationLabel: "1 día",
      realPct: "0,00%",
      planPct: "—",
      qtyPct: "—",
      certPct: "—",
      budgetLabel: "—",
      committedLabel: "—",
      alerts: "—",
      treeDepth: 1,
      barColor: "#7c3aed",
      progressRatio: 0,
    },
  ],
  gantt: {
    rangeStartIso: "2026-02-22",
    rangeEndIso: "2026-05-07",
    todayIso: "2026-03-20",
    todayLeft: 0.35,
    axisTicks: [
      { iso: "2026-03-01", label: "mar 2026", left: 0.1 },
      { iso: "2026-04-01", label: "abr 2026", left: 0.5 },
      { iso: "2026-05-01", label: "may 2026", left: 0.9 },
    ],
    scale: "monthly",
    periods: [
      { key: "2026-03", label: "mar 2026", startIso: "2026-03-01", endIso: "2026-03-31" },
      { key: "2026-04", label: "abr 2026", startIso: "2026-04-01", endIso: "2026-04-30" },
    ],
  },
};

test("SchedulePdfDocument renders table + gantt PDF", async () => {
  const buffer = await renderReportPdfToBuffer(
    <SchedulePdfDocument payload={payload} branding={branding} />,
  );
  assert.ok(buffer.length > 500);
  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
});
