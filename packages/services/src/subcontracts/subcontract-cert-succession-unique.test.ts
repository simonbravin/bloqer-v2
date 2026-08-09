import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

function mapSuccessionUniqueViolation(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ServiceError(
      "CONFLICT",
      "Ya existe una certificación sucesora activa para la certificación reemplazada.",
    );
  }
  throw err;
}

describe("subcontract certification succession unique [D-082]", () => {
  test("maps P2002 to CONFLICT Spanish message", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["replacesCertificationId"] },
    });
    assert.throws(
      () => mapSuccessionUniqueViolation(err),
      (e: unknown) =>
        e instanceof ServiceError
        && e.code === "CONFLICT"
        && e.message.includes("sucesora"),
    );
  });
});
