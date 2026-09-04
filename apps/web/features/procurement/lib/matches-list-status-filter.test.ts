import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countActiveListStatuses,
  matchesListStatusFilter,
} from "./matches-list-status-filter";

test("matchesListStatusFilter hides CANCELLED when no status selected", () => {
  assert.equal(matchesListStatusFilter("DRAFT", null), true);
  assert.equal(matchesListStatusFilter("SUBMITTED", null), true);
  assert.equal(matchesListStatusFilter("CANCELLED", null), false);
});

test("matchesListStatusFilter matches exact status when selected", () => {
  assert.equal(matchesListStatusFilter("CANCELLED", "CANCELLED"), true);
  assert.equal(matchesListStatusFilter("DRAFT", "CANCELLED"), false);
  assert.equal(matchesListStatusFilter("DRAFT", "DRAFT"), true);
});

test("countActiveListStatuses excludes CANCELLED", () => {
  assert.equal(countActiveListStatuses(["DRAFT", "CANCELLED", "SUBMITTED", "CANCELLED"]), 2);
  assert.equal(countActiveListStatuses([]), 0);
});
