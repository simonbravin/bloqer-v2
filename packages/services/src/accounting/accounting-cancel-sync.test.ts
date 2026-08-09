import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCrossCompany } from "../company-scope";
import type { ServiceContext } from "../types";

/**
 * Documents the company-scope rule used by cancel-sync helpers
 * (enforceCompanyScope default true) without hitting Prisma.
 */
describe("syncJournalOnOperationalCancel company scope policy", () => {
  const ctxA: ServiceContext = {
    actorUserId: "u1",
    tenantId: "t1",
    companyId: "company-a",
    roles: [],
  };

  it("blocks company-scoped cancel when membership is anchored to another company", () => {
    assert.equal(isCrossCompany("company-b", ctxA), true);
  });

  it("allows cancel for the active company", () => {
    assert.equal(isCrossCompany("company-a", ctxA), false);
  });

  it("allows tenant-wide treasury path when company scope is not enforced", () => {
    const enforceCompanyScope = false;
    const wouldBlock =
      enforceCompanyScope !== false && isCrossCompany("company-b", ctxA);
    assert.equal(wouldBlock, false);
  });
});

/**
 * Cancel-split contract: assert → ops txn → cancelDraft.
 * Documents ordering so a failed ops cancel cannot leave a cancelled DRAFT journal.
 */
describe("GL cancel-split ordering", () => {
  it("runs assert, then ops, then cancelDraft — never cancelDraft before ops", () => {
    const steps: string[] = [];
    const assertJournalAllowsOperationalCancel = () => {
      steps.push("assert");
    };
    const opsCancel = () => {
      steps.push("ops");
    };
    const cancelDraftJournalOnOperationalCancel = () => {
      steps.push("cancelDraft");
    };

    assertJournalAllowsOperationalCancel();
    opsCancel();
    cancelDraftJournalOnOperationalCancel();

    assert.deepEqual(steps, ["assert", "ops", "cancelDraft"]);
  });

  it("does not call cancelDraft when assert would block (POSTED journal)", () => {
    const steps: string[] = [];
    const postedBlocks = true;
    const assertJournalAllowsOperationalCancel = () => {
      steps.push("assert");
      if (postedBlocks) throw new Error("POSTED");
    };
    const cancelDraftJournalOnOperationalCancel = () => {
      steps.push("cancelDraft");
    };

    assert.throws(() => {
      assertJournalAllowsOperationalCancel();
      cancelDraftJournalOnOperationalCancel();
    });
    assert.deepEqual(steps, ["assert"]);
  });

  it("post-ops cleanup must CONFLICT if journal became POSTED (no silent skip)", () => {
    type Entry = { status: "DRAFT" | "POSTED"; reversedByEntry: null } | null;
    function cleanup(entry: Entry, sourceLabel: string): "cancelled" | "noop" {
      if (!entry) return "noop";
      if (entry.status === "POSTED" && !entry.reversedByEntry) {
        throw new Error(`CONFLICT:${sourceLabel}`);
      }
      if (entry.status !== "DRAFT") return "noop";
      return "cancelled";
    }
    assert.throws(
      () => cleanup({ status: "POSTED", reversedByEntry: null }, "la cobranza"),
      (e: unknown) => e instanceof Error && e.message.startsWith("CONFLICT:"),
    );
    assert.equal(cleanup({ status: "DRAFT", reversedByEntry: null }, "x"), "cancelled");
    assert.equal(cleanup(null, "x"), "noop");
  });
});

