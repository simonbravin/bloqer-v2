import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPendingBadgeLabel, pendingCountAriaLabel } from "./pending-count-badge";

test("formatPendingBadgeLabel hides zero, fractions below 1, and negatives", () => {
  assert.equal(formatPendingBadgeLabel(0), null);
  assert.equal(formatPendingBadgeLabel(0.9), null);
  assert.equal(formatPendingBadgeLabel(-1), null);
  assert.equal(formatPendingBadgeLabel(Number.NaN), null);
});

test("formatPendingBadgeLabel caps compact vs sidebar", () => {
  assert.equal(formatPendingBadgeLabel(3, "compact"), "3");
  assert.equal(formatPendingBadgeLabel(10, "compact"), "9+");
  assert.equal(formatPendingBadgeLabel(12, "sidebar"), "12");
  assert.equal(formatPendingBadgeLabel(100, "sidebar"), "99+");
});

test("pendingCountAriaLabel includes the real total and keeps the visible label", () => {
  assert.equal(pendingCountAriaLabel(0), "Pendientes");
  assert.equal(pendingCountAriaLabel(1), "Pendientes, 1 pendiente");
  assert.equal(pendingCountAriaLabel(12), "Pendientes, 12 pendientes");
  assert.equal(
    pendingCountAriaLabel(2, "Pendientes · todas las obras"),
    "Pendientes · todas las obras, 2 pendientes",
  );
});
