import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceError } from "../types";
import { assertCompanyProjectScopeMatch } from "./assert-company-project-scope";

describe("assertCompanyProjectScopeMatch", () => {
  const TENANT_CO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER_CO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("rejects company not in tenant (wrong tenant / unknown)", () => {
    assert.throws(
      () =>
        assertCompanyProjectScopeMatch({
          project: { companyId: null },
          companyInTenant: false,
          companyId: OTHER_CO,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "NOT_FOUND",
    );
  });

  it("rejects company mismatch when project has company", () => {
    assert.throws(
      () =>
        assertCompanyProjectScopeMatch({
          project: { companyId: TENANT_CO },
          companyInTenant: true,
          companyId: OTHER_CO,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("allows company in tenant when project company is null", () => {
    assert.doesNotThrow(() =>
      assertCompanyProjectScopeMatch({
        project: { companyId: null },
        companyInTenant: true,
        companyId: TENANT_CO,
      }),
    );
  });

  it("allows matching project company", () => {
    assert.doesNotThrow(() =>
      assertCompanyProjectScopeMatch({
        project: { companyId: TENANT_CO },
        companyInTenant: true,
        companyId: TENANT_CO,
      }),
    );
  });
});
