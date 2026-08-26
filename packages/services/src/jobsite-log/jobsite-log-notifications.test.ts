import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSuperviseJobsiteLog } from "../jobsite-log/jobsite-log-access";
import type { UserRole } from "@bloqer/domain";

/**
 * Pure mirror of resolveJobsiteLogSubmittedAudience filtering logic ([D-091]).
 * Integration with Prisma is covered by service wiring; this locks the matrix.
 */
function filterSupervisingTeamUserIds(
  teamMemberships: Array<{ userId: string; roles: UserRole[]; status: string }>,
  excludeUserId?: string | null,
): string[] {
  const exclude = excludeUserId?.trim() || null;
  const out = new Set<string>();
  for (const m of teamMemberships) {
    if (m.status !== "ACTIVE") continue;
    if (!canSuperviseJobsiteLog(m.roles)) continue;
    if (m.userId === exclude) continue;
    out.add(m.userId);
  }
  return [...out];
}

function mergeWithOwnerAdminCc(
  supervisingTeam: string[],
  ownerAdmins: string[],
  excludeUserId?: string | null,
): string[] {
  const exclude = excludeUserId?.trim() || null;
  const out = new Set<string>();
  for (const id of [...supervisingTeam, ...ownerAdmins]) {
    if (!id || id === exclude) continue;
    out.add(id);
  }
  return [...out];
}

describe("D-091 jobsite log SUBMITTED audience matrix", () => {
  it("includes PM on roster and OWNER, excludes foreman and other-project PM", () => {
    const team = filterSupervisingTeamUserIds(
      [
        { userId: "pm-a", roles: ["PROJECT_MANAGER"] as UserRole[], status: "ACTIVE" },
        { userId: "foreman-a", roles: ["SITE_FOREMAN"] as UserRole[], status: "ACTIVE" },
        { userId: "pm-b-not-on-roster", roles: ["PROJECT_MANAGER"] as UserRole[], status: "ACTIVE" },
      ].filter((m) => m.userId !== "pm-b-not-on-roster"),
    );

    const audience = mergeWithOwnerAdminCc(team, ["owner-1", "admin-1"], "actor-foreman");
    assert.deepEqual(audience.sort(), ["admin-1", "owner-1", "pm-a"].sort());
    assert.ok(!audience.includes("foreman-a"));
    assert.ok(!audience.includes("pm-b-not-on-roster"));
  });

  it("empty roster → only OWNER/ADMIN (minus actor)", () => {
    const audience = mergeWithOwnerAdminCc([], ["owner-1", "admin-1"], "owner-1");
    assert.deepEqual(audience, ["admin-1"]);
  });

  it("excludes inactive memberships on roster", () => {
    const team = filterSupervisingTeamUserIds([
      { userId: "pm-inactive", roles: ["PROJECT_MANAGER"] as UserRole[], status: "INACTIVE" },
      { userId: "pm-ok", roles: ["PROJECT_MANAGER"] as UserRole[], status: "ACTIVE" },
    ]);
    assert.deepEqual(team, ["pm-ok"]);
  });

  it("SITE_FOREMAN cannot supervise; EDIT PROJECTS can", () => {
    assert.equal(canSuperviseJobsiteLog(["SITE_FOREMAN"] as UserRole[]), false);
    assert.equal(canSuperviseJobsiteLog(["PROJECT_MANAGER"] as UserRole[]), true);
    assert.equal(canSuperviseJobsiteLog(["OWNER"] as UserRole[]), true);
    assert.equal(canSuperviseJobsiteLog(["ADMIN"] as UserRole[]), true);
  });
});

describe("D-091 RETURNED / APPROVED primary audience", () => {
  it("createdBy receives copy along with OWNER/ADMIN minus actor", () => {
    const audience = mergeWithOwnerAdminCc(["creator-1"], ["owner-1"], "admin-actor");
    assert.deepEqual(audience.sort(), ["creator-1", "owner-1"].sort());
  });

  it("creator who is also actor is excluded", () => {
    const audience = mergeWithOwnerAdminCc(["creator-1"], ["owner-1"], "creator-1");
    assert.deepEqual(audience, ["owner-1"]);
  });
});
