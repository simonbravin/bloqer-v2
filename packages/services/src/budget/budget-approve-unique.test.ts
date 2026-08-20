import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { rethrowIfBudgetApproveUniqueConflict } from "./budget.service";

describe("approveBudget unique (BUG-015)", () => {
  it("maps concurrent unique P2002 to CONFLICT, not 500", () => {
    const err = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { constraint: "budgets_one_approved_per_project_key" },
    });
    assert.throws(
      () => rethrowIfBudgetApproveUniqueConflict(err),
      (caught: unknown) =>
        caught instanceof ServiceError &&
        caught.code === "CONFLICT" &&
        /presupuesto aprobado/.test(caught.message),
    );
  });

  it("rethrown ServiceError stays ServiceError", () => {
    assert.throws(
      () => rethrowIfBudgetApproveUniqueConflict(new ServiceError("CONFLICT", "already")),
      (caught: unknown) => caught instanceof ServiceError && caught.message === "already",
    );
  });
});
