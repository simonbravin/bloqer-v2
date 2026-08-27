import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UserRole } from "@bloqer/domain";
import { hasAssignedProjectManager, isActiveJobsiteSupervisor } from "./project-team.service";

describe("isActiveJobsiteSupervisor", () => {
  it("is false without membership", () => {
    assert.equal(isActiveJobsiteSupervisor(undefined), false);
  });

  it("is false for inactive PM", () => {
    assert.equal(
      isActiveJobsiteSupervisor({
        status: "INACTIVE",
        roles: ["PROJECT_MANAGER"] as UserRole[],
      }),
      false,
    );
  });

  it("is true for active PM", () => {
    assert.equal(
      isActiveJobsiteSupervisor({
        status: "ACTIVE",
        roles: ["PROJECT_MANAGER"] as UserRole[],
      }),
      true,
    );
  });

  it("is false for active foreman without supervise ceiling", () => {
    assert.equal(
      isActiveJobsiteSupervisor({
        status: "ACTIVE",
        roles: ["SITE_FOREMAN"] as UserRole[],
      }),
      false,
    );
  });
});

describe("hasAssignedProjectManager", () => {
  it("is false when the roster is empty", () => {
    assert.equal(hasAssignedProjectManager([]), false);
  });

  it("is false when only a capataz is on the roster", () => {
    assert.equal(
      hasAssignedProjectManager([{ kind: "SITE_FOREMAN", membershipActive: true }]),
      false,
    );
  });

  it("is false when the PM membership is inactive", () => {
    assert.equal(
      hasAssignedProjectManager([{ kind: "PROJECT_MANAGER", membershipActive: false }]),
      false,
    );
  });

  it("is true when an active PM is on the roster", () => {
    assert.equal(
      hasAssignedProjectManager([
        { kind: "SITE_FOREMAN", membershipActive: true },
        { kind: "PROJECT_MANAGER", membershipActive: true },
      ]),
      true,
    );
  });
});
