import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  assertDirectPoAllowed,
  assertHighLevelApprover,
  assertProjectApDirectSpendAllowed,
  assertSelfApprovalAllowed,
  assertStandardApprover,
} from "./procurement-policy.service";
import type { CompanyProcurementSettingsView } from "./company-procurement-settings.service";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";

const baseSettings: CompanyProcurementSettingsView = {
  companyId: "company-1",
  poApprovalThresholdArs: null,
  purchaseRequestRequiredAboveArs: null,
  minQuotesRequired: 2,
  maxQuotesAllowed: 3,
  quoteRequiredCategories: null,
  allowDirectPo: true,
  allowSelfApproval: true,
  allowEmergencyDirectPo: false,
  varianceSoftAlertPct: "10",
  varianceNoteRequiredPct: "25",
  varianceExtraApprovalPct: "25",
  approvalSlaHours: 72,
};

function ctx(roles: ServiceContext["roles"]): ServiceContext {
  return {
    actorUserId: "user-1",
    tenantId: "tenant-1",
    companyId: "company-1",
    roles,
  };
}

test("assertSelfApprovalAllowed permits self approval only for standard approvals when enabled", () => {
  assert.doesNotThrow(() => {
    assertSelfApprovalAllowed(baseSettings, "user-1", "user-1", false, false);
  });
});

test("assertSelfApprovalAllowed blocks self approval when disabled", () => {
  assert.throws(
    () => {
      assertSelfApprovalAllowed({ ...baseSettings, allowSelfApproval: false }, "user-1", "user-1", false, false);
    },
    (err) => err instanceof ServiceError && err.code === "FORBIDDEN",
  );
});

test("assertSelfApprovalAllowed blocks self approval for extra variance approval", () => {
  assert.throws(
    () => {
      assertSelfApprovalAllowed(baseSettings, "user-1", "user-1", true, false);
    },
    (err) => err instanceof ServiceError && err.code === "FORBIDDEN",
  );
});

test("assertSelfApprovalAllowed blocks self approval for high level amount approval", () => {
  assert.throws(
    () => {
      assertSelfApprovalAllowed(baseSettings, "user-1", "user-1", false, true);
    },
    (err) => err instanceof ServiceError && err.code === "FORBIDDEN",
  );
});

test("assertSelfApprovalAllowed permits approval when actor is not originator", () => {
  assert.doesNotThrow(() => {
    assertSelfApprovalAllowed({ ...baseSettings, allowSelfApproval: false }, "user-1", "user-2", true, true);
  });
});

test("assertDirectPoAllowed allows below threshold for non-bypass role", () => {
  assert.doesNotThrow(() => {
    assertDirectPoAllowed(
      { ...baseSettings, purchaseRequestRequiredAboveArs: "100000" },
      new Prisma.Decimal("50000"),
      ctx(["PROJECT_MANAGER"]),
    );
  });
});

test("assertDirectPoAllowed rejects when direct PO disabled", () => {
  assert.throws(
    () => {
      assertDirectPoAllowed({ ...baseSettings, allowDirectPo: false }, new Prisma.Decimal("1000"), ctx(["PROJECT_MANAGER"]));
    },
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertDirectPoAllowed rejects amount at/above PR threshold without emergency", () => {
  assert.throws(
    () => {
      assertDirectPoAllowed(
        { ...baseSettings, purchaseRequestRequiredAboveArs: "100000" },
        new Prisma.Decimal("100000"),
        ctx(["PROJECT_MANAGER"]),
      );
    },
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertProjectApDirectSpendAllowed rejects non-approver above threshold", () => {
  assert.throws(
    () => {
      assertProjectApDirectSpendAllowed(
        { ...baseSettings, purchaseRequestRequiredAboveArs: "50000" },
        new Prisma.Decimal("60000"),
        ctx(["VIEWER"]),
      );
    },
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertProjectApDirectSpendAllowed allows OWNER above threshold", () => {
  assert.doesNotThrow(() => {
    assertProjectApDirectSpendAllowed(
      { ...baseSettings, purchaseRequestRequiredAboveArs: "50000" },
      new Prisma.Decimal("60000"),
      ctx(["OWNER"]),
    );
  });
});

test("assertHighLevelApprover rejects non-admin when high-level required", () => {
  assert.throws(
    () => assertHighLevelApprover(["PROCUREMENT"], true, false),
    (err) => err instanceof ServiceError && err.code === "FORBIDDEN",
  );
});

test("assertHighLevelApprover allows ADMIN when required", () => {
  assert.doesNotThrow(() => assertHighLevelApprover(["ADMIN"], true, true));
});

test("assertStandardApprover rejects VIEWER", () => {
  assert.throws(
    () => assertStandardApprover(["VIEWER"]),
    (err) => err instanceof ServiceError && err.code === "FORBIDDEN",
  );
});

test("assertStandardApprover allows PROCUREMENT", () => {
  assert.doesNotThrow(() => assertStandardApprover(["PROCUREMENT"]));
});
