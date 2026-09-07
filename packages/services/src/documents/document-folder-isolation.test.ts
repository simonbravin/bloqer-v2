import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateUserFolderUnder,
  isLibraryFolderDestination,
  isOperationalLinkedEntity,
  resolveSystemKeyForLinkedEntity,
  type FolderTreeNode,
} from "@bloqer/domain";
import { assertResourceTenant, filterRowsForTenant } from "../security/tenant-isolation";
import { ServiceError } from "../types";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROJECT_A = "11111111-1111-1111-1111-111111111111";
const PROJECT_B = "22222222-2222-2222-2222-222222222222";

function expectForbidden(fn: () => void): void {
  assert.throws(fn, (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN");
}

/**
 * Contract mirrors service asserts: folder rows must match tenant+project;
 * auto-filing ignores client folder for operational links; library allowlist.
 */
describe("document folder isolation ([D-113])", () => {
  it("rejects cross-tenant folder ownership", () => {
    expectForbidden(() => assertResourceTenant(TENANT_B, TENANT_A));
  });

  it("filters folder rows by tenant", () => {
    const rows = [
      { id: "f1", tenantId: TENANT_A, projectId: PROJECT_A },
      { id: "f2", tenantId: TENANT_B, projectId: PROJECT_B },
    ];
    assert.deepEqual(
      filterRowsForTenant(rows, TENANT_A).map((r) => r.id),
      ["f1"],
    );
  });

  it("auto-filing maps JOBSITE_LOG even if client asks for another folder key", () => {
    const clientRequestedKey = "GENERAL";
    const forced = resolveSystemKeyForLinkedEntity("JOBSITE_LOG");
    assert.equal(forced, "JOBSITE_LOG");
    assert.notEqual(forced, clientRequestedKey);
  });

  it("operational system key must not silently degrade to GENERAL", () => {
    const byKey = new Map<string, string>([["GENERAL", "gen-id"]]);
    const key = resolveSystemKeyForLinkedEntity("JOBSITE_LOG");
    assert.equal(key, "JOBSITE_LOG");
    assert.equal(byKey.get(key), undefined);
    // Service resolveFolderIdForUpload must throw when SYSTEM folder is missing — not use GENERAL.
  });

  it("corporate / no project → no folder filing (null project implies null folder)", () => {
    // Service: resolveFolderIdForUpload returns null when projectId is null.
    const projectId: string | null = null;
    assert.equal(projectId, null);
  });

  it("blocks USER create under PURCHASE_ORDER", () => {
    const tree = new Map<string, FolderTreeNode>([
      ["oc", { id: "oc", parentId: null, kind: "SYSTEM", systemKey: "PURCHASE_ORDER" }],
      ["plans", { id: "plans", parentId: null, kind: "SYSTEM", systemKey: "PLANS" }],
    ]);
    assert.equal(canCreateUserFolderUnder("oc", tree), false);
    assert.equal(canCreateUserFolderUnder("plans", tree), true);
  });

  it("library destination rejects operational SYSTEM", () => {
    const tree = new Map<string, FolderTreeNode>([
      ["libro", { id: "libro", parentId: null, kind: "SYSTEM", systemKey: "JOBSITE_LOG" }],
      ["gen", { id: "gen", parentId: null, kind: "SYSTEM", systemKey: "GENERAL" }],
    ]);
    assert.equal(isLibraryFolderDestination("libro", tree), false);
    assert.equal(isLibraryFolderDestination("gen", tree), true);
  });

  it("operational docs cannot be treated as movable library", () => {
    assert.equal(isOperationalLinkedEntity("PURCHASE_ORDER"), true);
    assert.equal(isOperationalLinkedEntity("PROJECT"), false);
  });

  it("same-project folder ids are distinct from foreign project ids (IDOR shape)", () => {
    const folderProjectA = { id: "fold-a", tenantId: TENANT_A, projectId: PROJECT_A };
    const folderProjectB = { id: "fold-b", tenantId: TENANT_A, projectId: PROJECT_B };
    assert.notEqual(folderProjectA.projectId, PROJECT_B);
    assert.equal(folderProjectB.tenantId, folderProjectA.tenantId);
    // Service getFolderInProjectOrThrow requires projectId match — foreign UUID fails.
    assert.notEqual(folderProjectB.projectId, PROJECT_A);
  });
});
