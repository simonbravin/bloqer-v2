import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateUserFolderUnder,
  folderDepth,
  isLibraryFolderDestination,
  isOperationalLinkedEntity,
  resolveSystemKeyForLinkedEntity,
  wouldCreateFolderCycle,
  type FolderTreeNode,
} from "./folder-rules";

function mapOf(nodes: FolderTreeNode[]): Map<string, FolderTreeNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

describe("resolveSystemKeyForLinkedEntity", () => {
  it("maps operational types and subcontract cert to SUBCONTRACT", () => {
    assert.equal(resolveSystemKeyForLinkedEntity("JOBSITE_LOG"), "JOBSITE_LOG");
    assert.equal(resolveSystemKeyForLinkedEntity("PURCHASE_ORDER"), "PURCHASE_ORDER");
    assert.equal(resolveSystemKeyForLinkedEntity("SUBCONTRACT_CERTIFICATION"), "SUBCONTRACT");
    assert.equal(resolveSystemKeyForLinkedEntity("PROJECT"), "GENERAL");
  });

  it("falls back unknown / null to GENERAL", () => {
    assert.equal(resolveSystemKeyForLinkedEntity(null), "GENERAL");
    assert.equal(resolveSystemKeyForLinkedEntity("WAREHOUSE_TRANSFER"), "GENERAL");
    assert.equal(resolveSystemKeyForLinkedEntity("OTHER"), "GENERAL");
  });
});

describe("isOperationalLinkedEntity", () => {
  it("treats PROJECT and null as library", () => {
    assert.equal(isOperationalLinkedEntity("PROJECT"), false);
    assert.equal(isOperationalLinkedEntity(null), false);
    assert.equal(isOperationalLinkedEntity("JOBSITE_LOG"), true);
  });
});

describe("library destination allowlist", () => {
  const tree = mapOf([
    { id: "gen", parentId: null, kind: "SYSTEM", systemKey: "GENERAL" },
    { id: "plans", parentId: null, kind: "SYSTEM", systemKey: "PLANS" },
    { id: "libro", parentId: null, kind: "SYSTEM", systemKey: "JOBSITE_LOG" },
    { id: "oc", parentId: null, kind: "SYSTEM", systemKey: "PURCHASE_ORDER" },
    { id: "arq", parentId: "plans", kind: "USER", systemKey: null },
    { id: "arq-det", parentId: "arq", kind: "USER", systemKey: null },
    { id: "bad", parentId: "libro", kind: "USER", systemKey: null },
  ]);

  it("allows GENERAL, PLANS and USER under them", () => {
    assert.equal(isLibraryFolderDestination("gen", tree), true);
    assert.equal(isLibraryFolderDestination("plans", tree), true);
    assert.equal(isLibraryFolderDestination("arq", tree), true);
    assert.equal(isLibraryFolderDestination("arq-det", tree), true);
  });

  it("rejects operational SYSTEM and USER under them", () => {
    assert.equal(isLibraryFolderDestination("libro", tree), false);
    assert.equal(isLibraryFolderDestination("oc", tree), false);
    assert.equal(isLibraryFolderDestination("bad", tree), false);
    assert.equal(canCreateUserFolderUnder("libro", tree), false);
    assert.equal(canCreateUserFolderUnder("plans", tree), true);
  });

  it("computes depth and cycle", () => {
    assert.equal(folderDepth("plans", tree), 1);
    assert.equal(folderDepth("arq", tree), 2);
    assert.equal(folderDepth("arq-det", tree), 3);
    assert.equal(wouldCreateFolderCycle("arq", "arq-det", tree), true);
    assert.equal(wouldCreateFolderCycle("arq", "gen", tree), false);
  });
});
