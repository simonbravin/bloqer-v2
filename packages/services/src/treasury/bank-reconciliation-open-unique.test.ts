import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

/**
 * Documents the open-session race contract ([D-075]/[D-080]):
 * migration `bank_reconciliations_one_open_per_account_key` + service P2002 mapping.
 */
function mapOpenReconUniqueViolation(err: unknown, reopen: boolean): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ServiceError(
      "CONFLICT",
      reopen
        ? "Ya hay otra conciliación abierta para esta cuenta. Cerrala o cancelala antes de reabrir."
        : "Ya hay una conciliación abierta para esta cuenta. Cerrala o cancelala antes de crear otra.",
    );
  }
  throw err;
}

describe("bank reconciliation open-session unique [D-075]", () => {
  test("maps P2002 on create to CONFLICT Spanish message", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["tenantId", "accountId"] },
    });
    assert.throws(
      () => mapOpenReconUniqueViolation(err, false),
      (e: unknown) =>
        e instanceof ServiceError
        && e.code === "CONFLICT"
        && e.message.includes("conciliación abierta"),
    );
  });

  test("maps P2002 on reopen to CONFLICT Spanish message", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["tenantId", "accountId"] },
    });
    assert.throws(
      () => mapOpenReconUniqueViolation(err, true),
      (e: unknown) =>
        e instanceof ServiceError
        && e.code === "CONFLICT"
        && e.message.includes("otra conciliación abierta"),
    );
  });

  test("rethrows non-P2002 errors", () => {
    assert.throws(
      () => mapOpenReconUniqueViolation(new Error("boom"), false),
      (e: unknown) => e instanceof Error && e.message === "boom",
    );
  });
});
