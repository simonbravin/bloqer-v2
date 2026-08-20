import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDaysLate, parseDateOnly } from "./schedule-helpers";
import {
  calendarRangeOverlapsIsoDay,
  calendarRangeOverlapsIsoRange,
  compareScheduleFieldItems,
  filterAndSortScheduleFieldItems,
  parseScheduleFieldFilter,
  scheduleFieldStatusActions,
  scheduleFieldWindow,
  summarizeScheduleFieldKpis,
  type ScheduleFieldDateItem,
} from "./schedule-field";

function item(
  partial: Partial<ScheduleFieldDateItem> & Pick<ScheduleFieldDateItem, "id" | "name">,
): ScheduleFieldDateItem {
  return {
    parentId: null,
    type: "TASK",
    status: "PLANNED",
    startDate: null,
    endDate: null,
    daysLate: null,
    wbsLinks: [],
    ...partial,
  };
}

const WINDOW = {
  todayIso: "2026-08-19",
  weekStart: "2026-08-17",
  weekEnd: "2026-08-23",
};

describe("parseScheduleFieldFilter", () => {
  it("parses canonical ids and day alias", () => {
    assert.equal(parseScheduleFieldFilter("today"), "today");
    assert.equal(parseScheduleFieldFilter("day"), "today");
    assert.equal(parseScheduleFieldFilter("week"), "week");
    assert.equal(parseScheduleFieldFilter("in_progress"), "in_progress");
    assert.equal(parseScheduleFieldFilter("nope"), null);
    assert.equal(parseScheduleFieldFilter(null), null);
  });
});

describe("Hoy — range includes product calendar day", () => {
  it("starts today", () => {
    assert.equal(calendarRangeOverlapsIsoDay("2026-08-19", "2026-08-21", WINDOW.todayIso), true);
  });
  it("ends today", () => {
    assert.equal(calendarRangeOverlapsIsoDay("2026-08-17", "2026-08-19", WINDOW.todayIso), true);
  });
  it("spans today", () => {
    assert.equal(calendarRangeOverlapsIsoDay("2026-08-10", "2026-08-25", WINDOW.todayIso), true);
  });
  it("ended yesterday", () => {
    assert.equal(calendarRangeOverlapsIsoDay("2026-08-10", "2026-08-18", WINDOW.todayIso), false);
  });
  it("starts tomorrow", () => {
    assert.equal(calendarRangeOverlapsIsoDay("2026-08-20", "2026-08-22", WINDOW.todayIso), false);
  });
  it("milestone on today uses single bound", () => {
    assert.equal(calendarRangeOverlapsIsoDay("2026-08-19", null, WINDOW.todayIso), true);
    assert.equal(calendarRangeOverlapsIsoDay(null, "2026-08-19", WINDOW.todayIso), true);
  });
});

describe("Esta semana — Monday–Sunday overlap", () => {
  it("fully inside", () => {
    assert.equal(
      calendarRangeOverlapsIsoRange("2026-08-18", "2026-08-19", WINDOW.weekStart, WINDOW.weekEnd),
      true,
    );
  });
  it("crosses week start (long task still active)", () => {
    assert.equal(
      calendarRangeOverlapsIsoRange("2026-08-01", "2026-08-18", WINDOW.weekStart, WINDOW.weekEnd),
      true,
    );
  });
  it("crosses week end", () => {
    assert.equal(
      calendarRangeOverlapsIsoRange("2026-08-22", "2026-09-01", WINDOW.weekStart, WINDOW.weekEnd),
      true,
    );
  });
  it("outside before", () => {
    assert.equal(
      calendarRangeOverlapsIsoRange("2026-08-01", "2026-08-16", WINDOW.weekStart, WINDOW.weekEnd),
      false,
    );
  });
  it("outside after", () => {
    assert.equal(
      calendarRangeOverlapsIsoRange("2026-08-24", "2026-08-30", WINDOW.weekStart, WINDOW.weekEnd),
      false,
    );
  });
});

describe("atrasadas uses computeDaysLate / daysLate", () => {
  it("KPI delayed count matches daysLate on leaves", () => {
    const now = new Date("2026-08-19T15:00:00.000Z");
    const delayedEnd = parseDateOnly("2026-08-16");
    const items = [
      item({
        id: "late",
        name: "Late",
        status: "IN_PROGRESS",
        startDate: "2026-08-01",
        endDate: "2026-08-16",
        daysLate: computeDaysLate(delayedEnd, "IN_PROGRESS", now),
      }),
      item({
        id: "ok",
        name: "Ok",
        status: "IN_PROGRESS",
        startDate: "2026-08-18",
        endDate: "2026-08-25",
        daysLate: computeDaysLate(parseDateOnly("2026-08-25"), "IN_PROGRESS", now),
      }),
      item({
        id: "done",
        name: "Done",
        status: "COMPLETED",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        daysLate: computeDaysLate(parseDateOnly("2026-08-10"), "COMPLETED", now),
      }),
    ];
    const kpis = summarizeScheduleFieldKpis(items);
    assert.equal(items[0]!.daysLate, 3);
    assert.equal(items[1]!.daysLate, null);
    assert.equal(items[2]!.daysLate, null);
    assert.equal(kpis.delayed, 1);
    assert.equal(filterAndSortScheduleFieldItems(items, "delayed", WINDOW).map((i) => i.id).join(), "late");
  });
});

describe("timezone near midnight", () => {
  it("Hoy uses ART calendar day, not UTC date", () => {
    // 2026-08-20 02:30 UTC = 2026-08-19 23:30 ART
    const now = new Date("2026-08-20T02:30:00.000Z");
    const window = scheduleFieldWindow(now);
    assert.equal(window.todayIso, "2026-08-19");
    assert.equal(window.weekStart, "2026-08-17");
    assert.equal(window.weekEnd, "2026-08-23");
    assert.equal(now.toISOString().slice(0, 10), "2026-08-20");
  });
});

describe("Field card order", () => {
  it("Hoy: blocked, delayed, in progress, then by startDate", () => {
    const items = [
      item({
        id: "planned",
        name: "Z planned today",
        startDate: "2026-08-19",
        endDate: "2026-08-19",
      }),
      item({
        id: "progress",
        name: "In progress",
        status: "IN_PROGRESS",
        startDate: "2026-08-18",
        endDate: "2026-08-20",
      }),
      item({
        id: "late",
        name: "Delayed still open",
        status: "IN_PROGRESS",
        startDate: "2026-08-01",
        endDate: "2026-08-19",
        daysLate: 2,
      }),
      item({
        id: "blocked",
        name: "Blocked",
        status: "BLOCKED",
        startDate: "2026-08-19",
        endDate: "2026-08-21",
      }),
    ];
    const ordered = filterAndSortScheduleFieldItems(items, "today", WINDOW);
    assert.deepEqual(
      ordered.map((i) => i.id),
      ["blocked", "late", "progress", "planned"],
    );
  });

  it("Atrasadas: daysLate desc, then oldest endDate", () => {
    const a = item({
      id: "a",
      name: "A",
      daysLate: 2,
      endDate: "2026-08-10",
    });
    const b = item({
      id: "b",
      name: "B",
      daysLate: 5,
      endDate: "2026-08-12",
    });
    const c = item({
      id: "c",
      name: "C",
      daysLate: 5,
      endDate: "2026-08-01",
    });
    const sorted = [a, b, c].sort((x, y) => compareScheduleFieldItems(x, y, "delayed"));
    assert.deepEqual(
      sorted.map((i) => i.id),
      ["c", "b", "a"],
    );
  });

  it("Semana: by startDate", () => {
    const items = [
      item({ id: "late-start", name: "Later", startDate: "2026-08-22", endDate: "2026-08-22" }),
      item({ id: "early", name: "Earlier", startDate: "2026-08-17", endDate: "2026-08-18" }),
    ];
    const ordered = filterAndSortScheduleFieldItems(items, "week", WINDOW);
    assert.deepEqual(
      ordered.map((i) => i.id),
      ["early", "late-start"],
    );
  });
});

describe("search and containers", () => {
  it("filters by name and WBS, drops containers", () => {
    const items = [
      item({ id: "parent", name: "Contenedor", wbsLinks: [{ wbsCode: "01", wbsName: "Obra" }] }),
      item({
        id: "child",
        parentId: "parent",
        name: "Hormigonado losa",
        startDate: "2026-08-19",
        endDate: "2026-08-19",
        wbsLinks: [{ wbsCode: "01.01", wbsName: "Estructura" }],
      }),
    ];
    const all = filterAndSortScheduleFieldItems(items, "all", WINDOW);
    assert.deepEqual(all.map((i) => i.id), ["child"]);
    const search = filterAndSortScheduleFieldItems(items, "all", WINDOW, "01.01");
    assert.equal(search.length, 1);
    const miss = filterAndSortScheduleFieldItems(items, "all", WINDOW, "no-match");
    assert.equal(miss.length, 0);
  });
});

describe("field status actions", () => {
  it("exposes existing transitions only", () => {
    assert.deepEqual(scheduleFieldStatusActions("PLANNED"), ["IN_PROGRESS", "BLOCKED"]);
    assert.deepEqual(scheduleFieldStatusActions("IN_PROGRESS"), ["COMPLETED", "BLOCKED"]);
    assert.deepEqual(scheduleFieldStatusActions("BLOCKED"), ["IN_PROGRESS"]);
    assert.deepEqual(scheduleFieldStatusActions("COMPLETED"), []);
  });
});
