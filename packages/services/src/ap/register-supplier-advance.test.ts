import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSupplierAdvance } from "./register-supplier-advance.service";
import { ServiceError } from "../types";

test("registerSupplierAdvance throws CONFLICT until Phase 2 bridge account", async () => {
  await assert.rejects(
    () =>
      registerSupplierAdvance(
        {
          projectId: "00000000-0000-4000-8000-000000000001",
          supplierContactId: "00000000-0000-4000-8000-000000000002",
          paymentDate: "2026-05-29",
          accountId: "00000000-0000-4000-8000-000000000003",
          currency: "ARS",
          amount: "100",
        },
        {
          actorUserId: "u",
          tenantId: "t",
          companyId: null,
          roles: [],
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, "CONFLICT");
      return true;
    },
  );
});
