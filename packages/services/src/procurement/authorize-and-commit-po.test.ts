import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { canAuthorizeAndCommitPo, willApproveAutoConfirmPo } from "./purchase-order-workflow.service";
import type { CompanyProcurementSettingsView } from "./company-procurement-settings.service";
import type { ServiceContext } from "../types";

const baseSettings: Pick<
  CompanyProcurementSettingsView,
  "allowAuthorizeAndCommit" | "allowSelfApproval" | "poApprovalThresholdArs"
> = {
  allowAuthorizeAndCommit: true,
  allowSelfApproval: true,
  poApprovalThresholdArs: "100000",
};

function ctx(
  roles: ServiceContext["roles"],
  actorUserId = "user-editor",
): Pick<ServiceContext, "roles" | "actorUserId"> {
  return { roles, actorUserId };
}

test("canAuthorizeAndCommitPo is false when policy is off", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      { ...baseSettings, allowAuthorizeAndCommit: false },
      { status: "DRAFT", totalAmount: "50000", currency: "ARS", lines: [] },
      ctx(["OWNER"]),
    ),
    false,
  );
});

test("canAuthorizeAndCommitPo is false for high-level amount when actor is not Admin", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "DRAFT",
        totalAmountArs: "1000",
        totalAmount: "100000",
        currency: "ARS",
        lines: [],
      },
      ctx(["PROJECT_MANAGER"]),
    ),
    false,
  );
});

test("canAuthorizeAndCommitPo is true for high-level amount when OWNER ([D-106])", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "DRAFT",
        totalAmount: "100000",
        currency: "ARS",
        lines: [],
      },
      ctx(["OWNER"]),
    ),
    true,
  );
});

test("canAuthorizeAndCommitPo is true for EXTRA_APPROVAL when ADMIN ([D-106])", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "SUBMITTED",
        totalAmount: "1000",
        currency: "ARS",
        lines: [{ varianceTier: "EXTRA_APPROVAL" }],
      },
      ctx(["ADMIN"]),
    ),
    true,
  );
});

test("canAuthorizeAndCommitPo is false for EXTRA_APPROVAL when PROCUREMENT ([D-106])", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "SUBMITTED",
        totalAmount: "1000",
        currency: "ARS",
        lines: [{ varianceTier: "EXTRA_APPROVAL" }],
      },
      ctx(["PROCUREMENT"]),
    ),
    false,
  );
});

test("canAuthorizeAndCommitPo uses live totalAmount over stale totalAmountArs", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "DRAFT",
        totalAmountArs: "200000",
        totalAmount: "50000",
        currency: "ARS",
        lines: [],
      },
      ctx(["PROJECT_MANAGER"]),
    ),
    true,
  );
});

test("canAuthorizeAndCommitPo is false when self-approval blocked", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      { ...baseSettings, allowSelfApproval: false },
      {
        status: "DRAFT",
        totalAmount: "1000",
        currency: "ARS",
        originRequestedByUserId: "user-editor",
        lines: [],
      },
      ctx(["PROJECT_MANAGER"], "user-editor"),
    ),
    false,
  );
});

test("canAuthorizeAndCommitPo is true for DRAFT under threshold with edit roles", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "DRAFT",
        totalAmount: new Prisma.Decimal("99999"),
        currency: "ARS",
        lines: [],
      },
      ctx(["PROJECT_MANAGER"]),
    ),
    true,
  );
});

test("canAuthorizeAndCommitPo is true for SUBMITTED under threshold", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      {
        status: "SUBMITTED",
        totalAmount: "50000",
        currency: "ARS",
        lines: [{ varianceTier: "NONE" }],
      },
      ctx(["PROCUREMENT"]),
    ),
    true,
  );
});

test("canAuthorizeAndCommitPo is false for APPROVED (confirm path remains)", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      { status: "APPROVED", totalAmount: "1000", currency: "ARS", lines: [] },
      ctx(["OWNER"]),
    ),
    false,
  );
});

test("canAuthorizeAndCommitPo is false when foreign FX is missing", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      baseSettings,
      { status: "DRAFT", totalAmount: "100", currency: "USD", fxRate: null, lines: [] },
      ctx(["OWNER"]),
    ),
    false,
  );
});

test("canAuthorizeAndCommitPo uses purchaseRequestRequestedByUserId for self-approval", () => {
  assert.equal(
    canAuthorizeAndCommitPo(
      { ...baseSettings, allowSelfApproval: false },
      {
        status: "DRAFT",
        totalAmount: "50000",
        currency: "ARS",
        originRequestedByUserId: null,
        purchaseRequestRequestedByUserId: "u1",
        lines: [],
      },
      ctx(["PROCUREMENT"], "u1"),
    ),
    false,
  );
});

test("willApproveAutoConfirmPo is false when policy off", () => {
  assert.equal(
    willApproveAutoConfirmPo(
      { autoConfirmOnApprove: false, poApprovalThresholdArs: "100000" },
      { totalAmount: "50000", currency: "ARS", lines: [] },
    ),
    false,
  );
});

test("willApproveAutoConfirmPo is true for low-level when policy on", () => {
  assert.equal(
    willApproveAutoConfirmPo(
      { autoConfirmOnApprove: true, poApprovalThresholdArs: "100000" },
      { totalAmount: "50000", currency: "ARS", lines: [] },
    ),
    true,
  );
});

test("willApproveAutoConfirmPo is false for high-level even when policy on", () => {
  assert.equal(
    willApproveAutoConfirmPo(
      { autoConfirmOnApprove: true, poApprovalThresholdArs: "100000" },
      { totalAmount: "100000", currency: "ARS", lines: [] },
    ),
    false,
  );
});
