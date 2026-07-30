import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGmtOffsetLabel,
  formatTimezoneOptionLabel,
  isValidIanaTimeZone,
  listTenantTimezoneSelectOptions,
  resolveDisplayTimeZone,
} from "./timezones";
import { PRODUCT_TIMEZONE } from "./calendar-date";
import { formatDateTime } from "./date-format";

describe("isValidIanaTimeZone", () => {
  it("accepts known IANA ids", () => {
    assert.equal(isValidIanaTimeZone("America/Argentina/Buenos_Aires"), true);
    assert.equal(isValidIanaTimeZone("UTC"), true);
  });

  it("rejects garbage", () => {
    assert.equal(isValidIanaTimeZone(""), false);
    assert.equal(isValidIanaTimeZone("Not/A_Zone"), false);
  });
});

describe("resolveDisplayTimeZone", () => {
  it("falls back to product TZ for invalid input", () => {
    assert.equal(resolveDisplayTimeZone("Not/A_Zone"), PRODUCT_TIMEZONE);
    assert.equal(
      resolveDisplayTimeZone("America/Argentina/Buenos_Aires"),
      "America/Argentina/Buenos_Aires",
    );
  });
});

describe("formatGmtOffsetLabel", () => {
  it("labels Buenos Aires as GMT-3 (no DST)", () => {
    // Mid-winter and mid-summer both ART = UTC-3
    const winter = new Date("2026-07-15T15:00:00.000Z");
    const summer = new Date("2026-01-15T15:00:00.000Z");
    assert.equal(formatGmtOffsetLabel("America/Argentina/Buenos_Aires", winter), "GMT-3");
    assert.equal(formatGmtOffsetLabel("America/Argentina/Buenos_Aires", summer), "GMT-3");
  });

  it("labels UTC as GMT+0", () => {
    assert.equal(formatGmtOffsetLabel("UTC", new Date("2026-07-15T12:00:00.000Z")), "GMT+0");
  });
});

describe("formatTimezoneOptionLabel", () => {
  it("includes city and GMT", () => {
    const label = formatTimezoneOptionLabel(
      "America/Argentina/Buenos_Aires",
      new Date("2026-07-15T12:00:00.000Z"),
    );
    assert.match(label, /Buenos Aires \(GMT-3\)/);
  });
});

describe("listTenantTimezoneSelectOptions", () => {
  it("includes current value when not in curated list", () => {
    const opts = listTenantTimezoneSelectOptions("Europe/London");
    assert.ok(opts.some((o) => o.value === "Europe/London"));
  });

  it("does not offer invalid current as selectable value", () => {
    const opts = listTenantTimezoneSelectOptions("Not/A_Zone");
    assert.ok(!opts.some((o) => o.value === "Not/A_Zone"));
  });
});

describe("formatDateTime with timeZone", () => {
  it("formats the same instant in Buenos Aires on any runtime TZ", () => {
    // 15:30 UTC = 12:30 ART (GMT-3)
    const instant = new Date("2026-07-15T15:30:00.000Z");
    const label = formatDateTime(instant, {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    assert.match(label, /15\/07\/2026/);
    assert.match(label, /12:30/);
  });

  it("pins product TZ when an invalid timeZone is requested", () => {
    const instant = new Date("2026-07-15T15:30:00.000Z");
    const label = formatDateTime(instant, { timeZone: "Not/A_Zone" });
    // Same as Buenos Aires (product default)
    assert.match(label, /12:30/);
  });

  it("keeps string fallback overload", () => {
    assert.equal(formatDateTime(null, "n/a"), "n/a");
  });
});
