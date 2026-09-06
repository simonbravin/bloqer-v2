/**
 * D-111 Phase C — membership admin + mode switch (Neon DEV).
 * Gated: BLOQER_AI_LIVE_DB=1 or BLOQER_D111_LIVE=1. Never production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import type { UserRole } from "@bloqer/database";
import { AI_ADV } from "../ai/fixtures/adversarial-ids";
import {
  restoreTenantATenantWide,
  seedD111ScopedFixtures,
  type D111ScopedFixtureResult,
} from "../ai/fixtures/seed-d111-scoped";
import { clearProjectAccessModeCache } from "../security/access";
import { listProjects } from "./project.service";
import {
  getUserProjectAccessEditor,
  previewMembershipScopedActivation,
  setTenantProjectAccessMode,
  setUserProjectMemberships,
} from "./project-membership.service";
import { ServiceError, type ServiceContext } from "../types";

function loadEnvIfNeeded(): void {
  if (process.env.DATABASE_URL) return;
  for (const p of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        let v = m[2]!;
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
      }
      return;
    } catch {
      /* next */
    }
  }
}

const live = process.env.BLOQER_AI_LIVE_DB === "1" || process.env.BLOQER_D111_LIVE === "1";

function assertNonProd(): void {
  const url = process.env.DATABASE_URL ?? "";
  assert.ok(!url.includes("ep-cold-mouse-appkpn84"), "refusing production Neon");
  assert.ok(
    url.includes("ep-curly-math") || url.includes("localhost"),
    `expected DEV host, got ${url.slice(0, 80)}`,
  );
}

function svc(
  tenantId: string,
  userId: string,
  roles: UserRole[],
  companyId: string | null = AI_ADV.tenantA.companyId,
): ServiceContext {
  return { actorUserId: userId, tenantId, companyId, roles };
}

describe("D-111 Phase C membership admin (Neon DEV)", { skip: !live }, () => {
  let fx: D111ScopedFixtureResult;
  let prisma: Awaited<typeof import("@bloqer/database")>["prisma"];
  const a = AI_ADV.tenantA;

  before(async () => {
    loadEnvIfNeeded();
    assertNonProd();
    ({ prisma } = await import("@bloqer/database"));
    fx = await seedD111ScopedFixtures(prisma);
  });

  after(async () => {
    if (process.env.BLOQER_D111_RESTORE_TENANT_WIDE === "1") {
      await restoreTenantATenantWide(prisma, fx.tenantAId);
    }
    clearProjectAccessModeCache();
  });

  it("PM cannot manage memberships (FORBIDDEN)", async () => {
    const ctx = svc(fx.tenantAId, a.pmUserId, ["PROJECT_MANAGER"]);
    await assert.rejects(
      () => getUserProjectAccessEditor(a.pmUserId, ctx),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
    );
    await assert.rejects(
      () => setUserProjectMemberships(a.pmUserId, [a.projectA1Id], ctx),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
    );
    await assert.rejects(
      () => setTenantProjectAccessMode({ mode: "TENANT_WIDE" }, ctx),
      (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
    );
  });

  it("rejects cross-tenant project IDs on setUserProjectMemberships", async () => {
    const owner = svc(fx.tenantAId, a.ownerUserId, ["OWNER"]);
    await assert.rejects(
      () =>
        setUserProjectMemberships(a.pmUserId, [AI_ADV.tenantB.projectB1Id], owner),
      (e: unknown) =>
        e instanceof ServiceError &&
        (e.code === "NOT_FOUND" || e.code === "FORBIDDEN" || e.code === "VALIDATION"),
    );
  });

  it("OWNER batch set memberships under SCOPED changes live access", async () => {
    const owner = svc(fx.tenantAId, a.ownerUserId, ["OWNER"]);

    // Ensure SCOPED + only A1
    await setTenantProjectAccessMode({ mode: "MEMBERSHIP_SCOPED", confirmLockouts: true }, owner);
    clearProjectAccessModeCache();
    await setUserProjectMemberships(a.pmUserId, [a.projectA1Id], owner);

    // Fresh ctx each list — scope is request-memoized on ServiceContext
    let listed = await listProjects({ pageSize: 50 }, svc(fx.tenantAId, a.pmUserId, ["PROJECT_MANAGER"]));
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0]!.id, a.projectA1Id);

    await setUserProjectMemberships(a.pmUserId, [a.projectA1Id, a.projectA2Id], owner);
    listed = await listProjects({ pageSize: 50 }, svc(fx.tenantAId, a.pmUserId, ["PROJECT_MANAGER"]));
    assert.equal(listed.data.length, 2);

    await setUserProjectMemberships(a.pmUserId, [a.projectA2Id], owner);
    listed = await listProjects({ pageSize: 50 }, svc(fx.tenantAId, a.pmUserId, ["PROJECT_MANAGER"]));
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0]!.id, a.projectA2Id);

    // Restore fixture default: PM → A1 only
    await setUserProjectMemberships(a.pmUserId, [a.projectA1Id], owner);
  });

  it("TENANT_WIDE: prepare memberships without changing listProjects for PM", async () => {
    const owner = svc(fx.tenantAId, a.ownerUserId, ["OWNER"]);

    await setTenantProjectAccessMode({ mode: "TENANT_WIDE" }, owner);
    clearProjectAccessModeCache();

    await setUserProjectMemberships(a.pmUserId, [a.projectA1Id], owner);
    const listedWide = await listProjects(
      { pageSize: 50 },
      svc(fx.tenantAId, a.pmUserId, ["PROJECT_MANAGER"]),
    );
    assert.ok(listedWide.data.length >= 2, "TENANT_WIDE PM sees all projects");

    const editor = await getUserProjectAccessEditor(a.pmUserId, owner);
    assert.equal(editor.mode, "TENANT_WIDE");
    assert.equal(editor.targetHasTenantWideAccess, false);
    assert.ok(editor.projects.some((p) => p.projectId === a.projectA1Id && p.assigned));

    // Re-activate SCOPED with fresh preview + confirm
    const preview = await previewMembershipScopedActivation(owner);
    assert.equal(preview.currentMode, "TENANT_WIDE");
    await setTenantProjectAccessMode(
      {
        mode: "MEMBERSHIP_SCOPED",
        confirmLockouts: preview.projectCapableWithoutProjects.length > 0 ? true : undefined,
      },
      owner,
    );
    clearProjectAccessModeCache();

    const listedScoped = await listProjects(
      { pageSize: 50 },
      svc(fx.tenantAId, a.pmUserId, ["PROJECT_MANAGER"]),
    );
    assert.equal(listedScoped.data.length, 1);
    assert.equal(listedScoped.data[0]!.id, a.projectA1Id);
  });

  it("OWNER editor shows tenant-wide access (no forced memberships)", async () => {
    const owner = svc(fx.tenantAId, a.ownerUserId, ["OWNER"]);
    const editor = await getUserProjectAccessEditor(a.ownerUserId, owner);
    assert.equal(editor.targetHasTenantWideAccess, true);
  });

  it("deactivating to TENANT_WIDE keeps memberships", async () => {
    const owner = svc(fx.tenantAId, a.ownerUserId, ["OWNER"]);
    await setUserProjectMemberships(a.pmUserId, [a.projectA1Id], owner);
    await setTenantProjectAccessMode({ mode: "TENANT_WIDE" }, owner);
    clearProjectAccessModeCache();

    const editor = await getUserProjectAccessEditor(a.pmUserId, owner);
    assert.equal(editor.mode, "TENANT_WIDE");
    assert.ok(editor.projects.some((p) => p.projectId === a.projectA1Id && p.assigned));

    // Leave DEV tenant SCOPED for Phase B continuity unless restore env set
    await setTenantProjectAccessMode({ mode: "MEMBERSHIP_SCOPED", confirmLockouts: true }, owner);
    clearProjectAccessModeCache();
  });
});
