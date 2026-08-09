import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSubcontractCertSuccessionAllowed } from "./subcontract-cert-succession";
import { ServiceError } from "../types";

const base = {
  id: "cert-rejected",
  subcontractId: "sc-1",
  status: "REJECTED",
  tenantId: "t1",
};

describe("assertSubcontractCertSuccessionAllowed (BR-SUB-005 / D-082)", () => {
  it("allows omitting replacesCertificationId", () => {
    assert.doesNotThrow(() =>
      assertSubcontractCertSuccessionAllowed({
        replacesCertificationId: null,
        predecessor: null,
        subcontractId: "sc-1",
        tenantId: "t1",
      }),
    );
  });

  it("allows linking to a REJECTED cert of the same subcontract", () => {
    assert.doesNotThrow(() =>
      assertSubcontractCertSuccessionAllowed({
        replacesCertificationId: base.id,
        predecessor: base,
        subcontractId: "sc-1",
        tenantId: "t1",
      }),
    );
  });

  it("rejects succession from non-REJECTED status", () => {
    assert.throws(
      () =>
        assertSubcontractCertSuccessionAllowed({
          replacesCertificationId: base.id,
          predecessor: { ...base, status: "APPROVED" },
          subcontractId: "sc-1",
          tenantId: "t1",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("rejects cross-subcontract succession", () => {
    assert.throws(
      () =>
        assertSubcontractCertSuccessionAllowed({
          replacesCertificationId: base.id,
          predecessor: base,
          subcontractId: "sc-other",
          tenantId: "t1",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION",
    );
  });

  it("rejects a second active successor for the same REJECTED cert", () => {
    assert.throws(
      () =>
        assertSubcontractCertSuccessionAllowed({
          replacesCertificationId: base.id,
          predecessor: base,
          subcontractId: "sc-1",
          tenantId: "t1",
          existingSuccessorId: "cert-already",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });
});
