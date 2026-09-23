import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickPrincipalContractualBudget } from "./pick-principal-budget";

describe("pickPrincipalContractualBudget", () => {
  it("keeps the approved principal when an addendum is also approved", () => {
    const picked = pickPrincipalContractualBudget([
      { id: "add", status: "APPROVED", versionNumber: 2, parentBudgetId: "root" },
      { id: "root", status: "APPROVED", versionNumber: 1, parentBudgetId: null },
    ]);
    assert.equal(picked?.id, "root");
  });

  it("prefers the newer approved principal over an older closed root", () => {
    const picked = pickPrincipalContractualBudget([
      { id: "old", status: "CLOSED", versionNumber: 1, parentBudgetId: null },
      { id: "current", status: "APPROVED", versionNumber: 2, parentBudgetId: null },
    ]);
    assert.equal(picked?.id, "current");
  });

  it("uses the latest closed root when nothing is approved", () => {
    const picked = pickPrincipalContractualBudget([
      { id: "old", status: "CLOSED", versionNumber: 1, parentBudgetId: null },
      { id: "newer", status: "CLOSED", versionNumber: 3, parentBudgetId: null },
      { id: "add", status: "CLOSED", versionNumber: 2, parentBudgetId: "old" },
    ]);
    assert.equal(picked?.id, "newer");
  });

  it("ignores drafts", () => {
    const picked = pickPrincipalContractualBudget([
      { id: "draft", status: "DRAFT", versionNumber: 2, parentBudgetId: null },
      { id: "root", status: "APPROVED", versionNumber: 1, parentBudgetId: null },
    ]);
    assert.equal(picked?.id, "root");
  });

  it("returns null when there is no contractual budget", () => {
    assert.equal(pickPrincipalContractualBudget([]), null);
  });
});
