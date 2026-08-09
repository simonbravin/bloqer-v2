import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertFinancialPeriodOpen } from "./period-lock.service";
import { ServiceError } from "../types";

describe("assertFinancialPeriodOpen (Phase 3 acceptance)", () => {
  it("no-ops when companyId is missing (legacy rows)", async () => {
    await assertFinancialPeriodOpen(
      { tenantId: "t1", companyId: null, date: "2026-08-15" },
      { period: { findFirst: async () => ({ periodKey: "2026-08" }) } } as never,
    );
  });

  it("allows mutation when no CLOSED period covers the date", async () => {
    let called = false;
    await assertFinancialPeriodOpen(
      { tenantId: "t1", companyId: "c1", date: "2026-08-15" },
      {
        period: {
          findFirst: async () => {
            called = true;
            return null;
          },
        },
      } as never,
    );
    assert.equal(called, true);
  });

  it("blocks mutation when date falls in a CLOSED period", async () => {
    await assert.rejects(
      () =>
        assertFinancialPeriodOpen(
          { tenantId: "t1", companyId: "c1", date: "2026-08-15" },
          {
            period: {
              findFirst: async () => ({ periodKey: "2026-08" }),
            },
          } as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.code, "CONFLICT");
        assert.match(err.message, /2026-08/);
        return true;
      },
    );
  });
});
