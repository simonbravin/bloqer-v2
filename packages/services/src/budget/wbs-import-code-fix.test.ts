import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestSequentialDuplicateFix } from "./wbs-import-code-fix";

describe("suggestSequentialDuplicateFix", () => {
  it("sugiere 11.10 tras 11.9 cuando se repite 11.1", () => {
    const prior = ["11", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9"];
    assert.equal(suggestSequentialDuplicateFix("11.1", prior), "11.10");
  });

  it("sugiere 12.10 tras 12.9 cuando se repite 12.1", () => {
    const prior = ["12", "12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9"];
    assert.equal(suggestSequentialDuplicateFix("12.1", prior), "12.10");
  });

  it("no corrige duplicado real al inicio de secuencia", () => {
    assert.equal(suggestSequentialDuplicateFix("11.1", ["11", "11.1"]), null);
  });
});
