import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "../types";
import { assertOptimisticRowUpdate } from "./optimistic-lock";

test("assertOptimisticRowUpdate passes when count is 1", () => {
  assert.doesNotThrow(() => assertOptimisticRowUpdate(1, "conflict"));
});

test("assertOptimisticRowUpdate throws CONFLICT when count is 0", () => {
  assert.throws(
    () => assertOptimisticRowUpdate(0, "El saldo cambió"),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT" && e.message === "El saldo cambió",
  );
});

test("assertOptimisticRowUpdate throws CONFLICT when count > 1", () => {
  assert.throws(
    () => assertOptimisticRowUpdate(2, "Duplicado inesperado"),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});
