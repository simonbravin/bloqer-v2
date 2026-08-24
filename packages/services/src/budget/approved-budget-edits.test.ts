import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Budget } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertBudgetEditable, canManageApprovedBudgetEditPolicy } from "./budget.service";

function baseBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    tenantId: "tenant-1",
    companyId: null,
    projectId: "project-1",
    parentBudgetId: null,
    versionNumber: 1,
    name: "Test",
    status: "APPROVED",
    currency: "ARS",
    totalCost: 0 as unknown as Budget["totalCost"],
    totalSalePrice: 0 as unknown as Budget["totalSalePrice"],
    approvedSnapshotTotalCost: null,
    approvedSnapshotTotalSalePrice: null,
    internalNotes: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockClient(opts: {
  tenantAllow?: boolean;
  projectAllow?: boolean;
  projectTenantId?: string;
}) {
  return {
    tenant: {
      findUnique: async () =>
        opts.tenantAllow === undefined
          ? null
          : { allowApprovedBudgetEconomicEdits: opts.tenantAllow },
    },
    project: {
      findUnique: async () =>
        opts.projectAllow === undefined
          ? null
          : {
              allowApprovedBudgetEconomicEdits: opts.projectAllow,
              tenantId: opts.projectTenantId ?? "tenant-1",
            },
    },
  };
}

describe("assertBudgetEditable ([D-088])", () => {
  it("allows DRAFT without reading flags", async () => {
    await assertBudgetEditable(baseBudget({ status: "DRAFT" }), mockClient({}));
  });

  it("allows RETURNED_FOR_CHANGES without reading flags", async () => {
    await assertBudgetEditable(baseBudget({ status: "RETURNED_FOR_CHANGES" }), mockClient({}));
  });

  it("blocks APPROVED when both flags default/off", async () => {
    await assert.rejects(
      () =>
        assertBudgetEditable(
          baseBudget({ status: "APPROVED" }),
          mockClient({ tenantAllow: false, projectAllow: false }),
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === "CONFLICT" &&
        /deshabilitada en la organización/.test(err.message),
    );
  });

  it("blocks APPROVED when tenant ON and project OFF", async () => {
    await assert.rejects(
      () =>
        assertBudgetEditable(
          baseBudget({ status: "APPROVED" }),
          mockClient({ tenantAllow: true, projectAllow: false }),
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === "CONFLICT" &&
        /no está habilitada para esta obra/.test(err.message),
    );
  });

  it("blocks APPROVED when tenant OFF and project ON", async () => {
    await assert.rejects(
      () =>
        assertBudgetEditable(
          baseBudget({ status: "APPROVED" }),
          mockClient({ tenantAllow: false, projectAllow: true }),
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === "CONFLICT" &&
        /deshabilitada en la organización/.test(err.message),
    );
  });

  it("allows APPROVED when both flags ON", async () => {
    await assertBudgetEditable(
      baseBudget({ status: "APPROVED" }),
      mockClient({ tenantAllow: true, projectAllow: true }),
    );
  });

  it("never allows CLOSED even with both flags ON", async () => {
    await assert.rejects(
      () =>
        assertBudgetEditable(
          baseBudget({ status: "CLOSED" }),
          mockClient({ tenantAllow: true, projectAllow: true }),
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === "CONFLICT" &&
        /cerrado/.test(err.message),
    );
  });

  it("blocks IN_REVIEW", async () => {
    await assert.rejects(
      () => assertBudgetEditable(baseBudget({ status: "IN_REVIEW" }), mockClient({})),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });
});

describe("canManageApprovedBudgetEditPolicy", () => {
  it("allows OWNER and ADMIN only", () => {
    assert.equal(canManageApprovedBudgetEditPolicy(["OWNER"]), true);
    assert.equal(canManageApprovedBudgetEditPolicy(["ADMIN"]), true);
    assert.equal(canManageApprovedBudgetEditPolicy(["PROJECT_MANAGER"]), false);
    assert.equal(canManageApprovedBudgetEditPolicy(["FINANCE"]), false);
  });
});
