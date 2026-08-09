import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertInternalTransferLegsValid,
  buildInternalTransferLegs,
} from "./internal-transfer.service";
import { ServiceError } from "../types";

describe("internal transfer legs (Phase 3 acceptance / BR-TRZ-004)", () => {
  it("builds exactly two movements with the same transferId and amount", () => {
    const transferId = "tr-1";
    const legs = buildInternalTransferLegs({
      transferId,
      amount: "1500.00",
      sourceAccountId: "acc-a",
      destinationAccountId: "acc-b",
    });

    assert.equal(legs.length, 2);
    assert.equal(legs[0]?.type, "TRANSFER_OUT");
    assert.equal(legs[1]?.type, "TRANSFER_IN");
    assert.equal(legs[0]?.transferId, transferId);
    assert.equal(legs[1]?.transferId, transferId);
    assert.equal(legs[0]?.amount, "1500.00");
    assert.equal(legs[1]?.amount, "1500.00");
    assert.equal(legs[0]?.accountId, "acc-a");
    assert.equal(legs[1]?.accountId, "acc-b");

    assert.doesNotThrow(() => assertInternalTransferLegsValid(legs));
  });

  it("rejects same source and destination account", () => {
    const legs = buildInternalTransferLegs({
      transferId: "tr-2",
      amount: "10.00",
      sourceAccountId: "acc-a",
      destinationAccountId: "acc-a",
    });
    assert.throws(
      () => assertInternalTransferLegsValid(legs),
      (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION",
    );
  });
});
