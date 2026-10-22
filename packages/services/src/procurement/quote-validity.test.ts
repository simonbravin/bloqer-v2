import assert from "node:assert/strict";
import { test } from "node:test";
import { isProcurementQuoteExpired } from "./quote-validity";

const validUntil = new Date("2026-10-22T00:00:00.000Z");

test("a quote remains valid throughout the stated calendar date in Argentina", () => {
  assert.equal(isProcurementQuoteExpired(validUntil, new Date("2026-10-22T15:00:00Z")), false);
  assert.equal(isProcurementQuoteExpired(validUntil, new Date("2026-10-23T02:59:59.999Z")), false);
});

test("a quote expires at the start of the next product calendar day", () => {
  assert.equal(isProcurementQuoteExpired(validUntil, new Date("2026-10-23T03:00:00Z")), true);
});

test("future and missing validity dates are not expired", () => {
  const now = new Date("2026-10-21T15:00:00Z");
  assert.equal(isProcurementQuoteExpired(validUntil, now), false);
  assert.equal(isProcurementQuoteExpired(null, now), false);
});
