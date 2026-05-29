import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "../types";
import { assertCanCancelAccountMovement } from "./account-movement-cancel-guards";

test("assertCanCancelAccountMovement rejects non-CONFIRMED", () => {
  assert.throws(
    () =>
      assertCanCancelAccountMovement({
        status: "CANCELLED",
        sourceType: "MANUAL_ADJUSTMENT",
        transferId: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelAccountMovement rejects PAYMENT source", () => {
  assert.throws(
    () =>
      assertCanCancelAccountMovement({
        status: "CONFIRMED",
        sourceType: "PAYMENT",
        transferId: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelAccountMovement rejects OPENING_BALANCE source", () => {
  assert.throws(
    () =>
      assertCanCancelAccountMovement({
        status: "CONFIRMED",
        sourceType: "OPENING_BALANCE",
        transferId: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelAccountMovement rejects transfer movements", () => {
  assert.throws(
    () =>
      assertCanCancelAccountMovement({
        status: "CONFIRMED",
        sourceType: "INTERNAL_TRANSFER",
        transferId: "transfer-1",
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelAccountMovement rejects COLLECTION source", () => {
  assert.throws(
    () =>
      assertCanCancelAccountMovement({
        status: "CONFIRMED",
        sourceType: "COLLECTION",
        transferId: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelAccountMovement rejects INTERNAL_TRANSFER without transferId", () => {
  assert.throws(
    () =>
      assertCanCancelAccountMovement({
        status: "CONFIRMED",
        sourceType: "INTERNAL_TRANSFER",
        transferId: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelAccountMovement allows MANUAL_ADJUSTMENT", () => {
  assert.doesNotThrow(() =>
    assertCanCancelAccountMovement({
      status: "CONFIRMED",
      sourceType: "MANUAL_ADJUSTMENT",
      transferId: null,
    }),
  );
});
