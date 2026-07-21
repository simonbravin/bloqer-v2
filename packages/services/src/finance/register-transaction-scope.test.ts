import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertCorporatePayableScope, assertCorporateReceivableScope } from "./register-transaction-corporate-scope";
import { ServiceError } from "../types";

const baseCtx = {
  actorUserId: "u1",
  tenantId: "t1",
  companyId: "c1",
  roles: [],
};

describe("assertCorporatePayableScope", () => {
  it("allows corporate payable for matching company", () => {
    assert.doesNotThrow(() =>
      assertCorporatePayableScope({ projectId: null, companyId: "c1" }, baseCtx),
    );
  });

  it("rejects project-scoped payable", () => {
    assert.throws(
      () => assertCorporatePayableScope({ projectId: "p1", companyId: "c1" }, baseCtx),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });

  it("rejects payable from another company when ctx has companyId", () => {
    assert.throws(
      () => assertCorporatePayableScope({ projectId: null, companyId: "c2" }, baseCtx),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });

  it("allows any company when ctx.companyId is unset", () => {
    assert.doesNotThrow(() =>
      assertCorporatePayableScope(
        { projectId: null, companyId: "c2" },
        { ...baseCtx, companyId: null },
      ),
    );
  });
});

describe("assertCorporateReceivableScope (D-051)", () => {
  it("allows corporate receivable for matching company", () => {
    assert.doesNotThrow(() =>
      assertCorporateReceivableScope({ projectId: null, companyId: "c1" }, baseCtx),
    );
  });

  it("rejects project-scoped receivable", () => {
    assert.throws(
      () => assertCorporateReceivableScope({ projectId: "p1", companyId: "c1" }, baseCtx),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });

  it("rejects receivable from another company when ctx has companyId", () => {
    assert.throws(
      () => assertCorporateReceivableScope({ projectId: null, companyId: "c2" }, baseCtx),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });
});
