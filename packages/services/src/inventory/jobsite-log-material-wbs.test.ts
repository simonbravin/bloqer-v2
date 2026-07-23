import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveJobsiteLogMaterialWbs } from "../inventory/stock-movement.service";
import { ServiceError } from "../types";

test("resolveJobsiteLogMaterialWbs prefers explicit material WBS", () => {
  assert.equal(resolveJobsiteLogMaterialWbs("wbs-a", ["wbs-b", "wbs-c"]), "wbs-a");
});

test("resolveJobsiteLogMaterialWbs uses sole progress WBS", () => {
  assert.equal(resolveJobsiteLogMaterialWbs(null, ["wbs-a", "wbs-a"]), "wbs-a");
});

test("resolveJobsiteLogMaterialWbs rejects empty progress without material WBS", () => {
  assert.throws(
    () => resolveJobsiteLogMaterialWbs(null, []),
    (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("resolveJobsiteLogMaterialWbs rejects multiple progress WBS without material WBS", () => {
  assert.throws(
    () => resolveJobsiteLogMaterialWbs(null, ["wbs-a", "wbs-b"]),
    (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});
