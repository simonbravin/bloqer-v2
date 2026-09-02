import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError } from "../types";
import { assertSubcontractCertificationLinesHaveWbs } from "./subcontract-cert-approve-guards";

test("assertSubcontractCertificationLinesHaveWbs accepts lines with EDT", () => {
  assert.doesNotThrow(() =>
    assertSubcontractCertificationLinesHaveWbs([
      { subcontractLine: { wbsNodeId: "wbs-1" } },
      { subcontractLine: { wbsNodeId: "wbs-2" } },
    ]),
  );
});

test("assertSubcontractCertificationLinesHaveWbs rejects missing EDT", () => {
  assert.throws(
    () =>
      assertSubcontractCertificationLinesHaveWbs([
        { subcontractLine: { wbsNodeId: "wbs-1" } },
        { subcontractLine: { wbsNodeId: null } },
      ]),
    (err: unknown) =>
      err instanceof ServiceError &&
      err.code === "VALIDATION" &&
      /partida EDT/.test(err.message),
  );
});
