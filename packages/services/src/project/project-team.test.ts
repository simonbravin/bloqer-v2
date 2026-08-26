import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UserRole } from "@bloqer/domain";
import { isActiveJobsiteSupervisor } from "./project-team.service";

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
