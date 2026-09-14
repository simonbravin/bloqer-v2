import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDate,
  formatDateLong,
  formatDbDate,
  isPrismaDateOnlyInstant,
} from "./date-format";

describe("isPrismaDateOnlyInstant", () => {
  it("detects UTC midnight (@db.Date wire format)", () => {
    assert.equal(isPrismaDateOnlyInstant(new Date("2026-09-14T00:00:00.000Z")), true);
  });

  it("rejects timestamps with a non-zero UTC time", () => {
    assert.equal(isPrismaDateOnlyInstant(new Date("2026-09-14T15:30:00.000Z")), false);
  });
});

describe("formatDbDate (@db.Date / UTC midnight)", () => {
  it("keeps the UTC calendar day even when the runtime TZ is west of UTC", () => {
    const neededBy = new Date("2026-09-14T00:00:00.000Z");
    assert.equal(formatDbDate(neededBy), "14/09/2026");
    // Explicit America/* without auto-detect would show the previous day.
    assert.equal(
      formatDate(neededBy, { timeZone: "America/Argentina/Buenos_Aires" }),
      "13/09/2026",
    );
  });

  it("accepts ISO strings from RSC → client serialization", () => {
    assert.equal(formatDbDate("2026-09-14T00:00:00.000Z"), "14/09/2026");
  });

  it("accepts bare YYYY-MM-DD without local-TZ shift", () => {
    assert.equal(formatDbDate("2026-09-14"), "14/09/2026");
    assert.equal(formatDate("2026-09-14"), "14/09/2026");
  });

  it("returns fallback for nullish", () => {
    assert.equal(formatDbDate(null), "—");
    assert.equal(formatDbDate(undefined, "n/a"), "n/a");
  });
});

describe("formatDate auto-pins UTC for @db.Date instants", () => {
  it("formats UTC midnight as the UTC calendar day without an explicit timeZone", () => {
    assert.equal(formatDate(new Date("2026-09-14T00:00:00.000Z")), "14/09/2026");
    assert.equal(formatDate("2026-09-14T00:00:00.000Z"), "14/09/2026");
  });

  it("formatDateLong also auto-pins UTC midnight", () => {
    const label = formatDateLong(new Date("2026-09-14T00:00:00.000Z"));
    assert.match(label, /14/);
    assert.match(label, /septiembre/i);
    assert.match(label, /2026/);
  });
});
