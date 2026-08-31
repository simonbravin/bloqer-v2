import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGanttPeriods,
  buildScheduleExportFilterLine,
  chooseGanttScale,
  excelSerialFromIsoDateOnly,
  filterScheduleItemsForExport,
  formatScheduleExportDate,
  ganttBarFraction,
  indentScheduleExportName,
  keepScheduleItemsOverlappingRange,
  parseScheduleExportIsoDate,
  parseScheduleExportView,
  periodOverlapsItem,
  resolveExportGanttRange,
  scheduleExportTypeLabel,
  splitGanttPdfWindows,
  todayMarkerFraction,
} from "./schedule-export-pure";

test("formatScheduleExportDate is dd/MM/yyyy without TZ shift", () => {
  assert.equal(formatScheduleExportDate("2026-01-05"), "05/01/2026");
  assert.equal(formatScheduleExportDate("2026-12-31"), "31/12/2026");
  assert.equal(formatScheduleExportDate(null), "—");
  assert.equal(formatScheduleExportDate(undefined), "—");
});

test("filterScheduleItemsForExport hides CANCELLED unless status is set", () => {
  const items = [
    { id: "a", status: "PLANNED" },
    { id: "b", status: "CANCELLED" },
    { id: "c", status: "IN_PROGRESS" },
  ];
  assert.deepEqual(
    filterScheduleItemsForExport(items, undefined).map((i) => i.id),
    ["a", "c"],
  );
  assert.deepEqual(
    filterScheduleItemsForExport(items, "CANCELLED").map((i) => i.id),
    ["b"],
  );
});

test("ganttBarFraction places a full-range task at 0–1", () => {
  const bar = ganttBarFraction("2026-03-01", "2026-03-31", "2026-03-01", "2026-03-31");
  assert.ok(bar);
  assert.equal(bar.left, 0);
  assert.ok(Math.abs(bar.width - 1) < 1e-9);
});

test("ganttBarFraction gives a one-day task 1/span width", () => {
  const bar = ganttBarFraction("2026-03-01", "2026-03-01", "2026-03-01", "2026-03-10");
  assert.ok(bar);
  assert.equal(bar.left, 0);
  assert.ok(Math.abs(bar.width - 0.1) < 1e-9);
});

test("ganttBarFraction clips a bar that starts before the window", () => {
  const bar = ganttBarFraction("2026-01-01", "2026-03-15", "2026-03-01", "2026-03-31");
  assert.ok(bar);
  assert.equal(bar.left, 0);
  assert.ok(Math.abs(bar.width - 15 / 31) < 1e-9);
});

test("ganttBarFraction is null when the task is outside the window", () => {
  assert.equal(ganttBarFraction("2026-01-01", "2026-01-31", "2026-03-01", "2026-03-31"), null);
});

test("todayMarkerFraction is 0 at range start", () => {
  assert.equal(todayMarkerFraction("2026-04-01", "2026-04-11", "2026-04-01"), 0);
});

test("todayMarkerFraction aligns with a one-day bar on the last day", () => {
  const rangeStart = "2026-03-01";
  const rangeEnd = "2026-03-10";
  const today = "2026-03-10";
  const marker = todayMarkerFraction(rangeStart, rangeEnd, today);
  const bar = ganttBarFraction(today, today, rangeStart, rangeEnd);
  assert.ok(bar);
  assert.equal(marker, bar.left);
});

test("chooseGanttScale prefers weekly for short spans", () => {
  assert.equal(chooseGanttScale("2026-01-01", "2026-02-15"), "weekly");
  assert.equal(chooseGanttScale("2026-01-01", "2027-06-01"), "monthly");
});

test("buildGanttPeriods weekly starts on Monday and covers the range", () => {
  const periods = buildGanttPeriods("2026-03-04", "2026-03-12", "weekly");
  assert.ok(periods.length >= 2);
  assert.equal(periods[0]?.startIso, "2026-03-02");
  assert.ok(periodOverlapsItem(periods[0]!, "2026-03-04", "2026-03-05"));
});

test("parseScheduleExportIsoDate accepts date-only and rejects datetimes", () => {
  assert.equal(parseScheduleExportIsoDate("2026-03-15"), "2026-03-15");
  assert.equal(parseScheduleExportIsoDate(" 2026-03-15 "), "2026-03-15");
  assert.equal(parseScheduleExportIsoDate("2026-03-15T12:00:00Z"), undefined);
  assert.equal(parseScheduleExportIsoDate("15/03/2026"), undefined);
  assert.equal(parseScheduleExportIsoDate("2026-02-31"), undefined);
  assert.equal(parseScheduleExportIsoDate(""), undefined);
});

test("resolveExportGanttRange uses custom bounds and swaps inverted dates", () => {
  const auto = { startIso: "2026-01-01", endIso: "2026-12-31" };
  assert.deepEqual(resolveExportGanttRange(auto, "2026-03-01", "2026-03-31"), {
    startIso: "2026-03-01",
    endIso: "2026-03-31",
  });
  assert.deepEqual(resolveExportGanttRange(auto, "2026-12-01", "2026-01-15"), {
    startIso: "2026-01-15",
    endIso: "2026-12-01",
  });
  assert.deepEqual(resolveExportGanttRange(auto, "2026-06-01", undefined), {
    startIso: "2026-06-01",
    endIso: "2026-12-31",
  });
  assert.deepEqual(resolveExportGanttRange(auto, undefined, "2026-02-01"), {
    startIso: "2026-01-01",
    endIso: "2026-02-01",
  });
  assert.deepEqual(resolveExportGanttRange(null, "2026-03-01", undefined), {
    startIso: "2026-03-01",
    endIso: "2026-03-01",
  });
  assert.deepEqual(resolveExportGanttRange(auto, undefined, undefined), auto);
});

test("periodOverlapsItem excludes items without dates", () => {
  const range = { startIso: "2026-03-01", endIso: "2026-03-31" };
  assert.equal(periodOverlapsItem(range, "2026-03-10", "2026-03-20"), true);
  assert.equal(periodOverlapsItem(range, "2026-01-01", "2026-01-31"), false);
  assert.equal(periodOverlapsItem(range, null, null), false);
});

test("keepScheduleItemsOverlappingRange keeps ancestors without dates", () => {
  const items = [
    { id: "p", parentId: null, startDate: null, endDate: null },
    { id: "c", parentId: "p", startDate: "2026-03-10", endDate: "2026-03-20" },
    { id: "o", parentId: null, startDate: "2026-01-01", endDate: "2026-01-31" },
  ];
  assert.deepEqual(
    keepScheduleItemsOverlappingRange(items, "2026-03-01", "2026-03-31").map((i) => i.id),
    ["p", "c"],
  );
});

test("keepScheduleItemsOverlappingRange keeps a parent that itself overlaps", () => {
  const items = [
    { id: "p", parentId: null, startDate: "2026-01-01", endDate: "2026-12-31" },
    { id: "c", parentId: "p", startDate: "2026-06-01", endDate: "2026-06-15" },
  ];
  assert.deepEqual(
    keepScheduleItemsOverlappingRange(items, "2026-03-01", "2026-03-31").map((i) => i.id),
    ["p"],
  );
});

test("parseScheduleExportView maps calendar/kanban to both", () => {
  assert.equal(parseScheduleExportView("gantt"), "gantt");
  assert.equal(parseScheduleExportView("table"), "table");
  assert.equal(parseScheduleExportView("kanban"), "both");
  assert.equal(parseScheduleExportView(undefined), "both");
});

test("indent and type labels", () => {
  assert.equal(indentScheduleExportName("Obra", 2), "    Obra");
  assert.equal(scheduleExportTypeLabel({ type: "MILESTONE", isLeaf: true }), "Hito");
  assert.equal(scheduleExportTypeLabel({ type: "TASK", isLeaf: false }), "Contenedor");
});

test("splitGanttPdfWindows paginates the axis horizontally", () => {
  const windows = splitGanttPdfWindows("2026-01-01", "2026-12-31", "monthly");
  assert.ok(windows.length >= 2);
  assert.equal(windows[0]?.startIso, "2026-01-01");
  assert.equal(windows[windows.length - 1]?.endIso, "2026-12-31");
});

test("excelSerialFromIsoDateOnly is stable for date-only ISO", () => {
  assert.equal(excelSerialFromIsoDateOnly("2026-01-05"), 46027);
  assert.equal(excelSerialFromIsoDateOnly(null), null);
});

test("filter line describes active filters in Spanish", () => {
  const line = buildScheduleExportFilterLine({
    budgetName: "Base 2026",
    itemType: "TASK",
    delayedOnly: true,
    view: "gantt",
    fromIso: "2026-03-01",
    toIso: "2026-03-31",
  });
  assert.match(line, /Presupuesto: Base 2026/);
  assert.match(line, /Tipo: Tareas/);
  assert.match(line, /Solo atrasados/);
  assert.match(line, /Activos/);
  assert.match(line, /Contenido: Gantt/);
  assert.match(line, /Lapso: 01\/03\/2026 → 31\/03\/2026/);
});
