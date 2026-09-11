import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultEmailEnabledForCategory,
  notificationTypeToEmailCategory,
  resolveNotificationEmailPreference,
  visibleEmailCategoriesForRoles,
} from "./email-categories";

describe("notificationTypeToEmailCategory", () => {
  it("maps flow and escalation types", () => {
    assert.equal(notificationTypeToEmailCategory("PURCHASE_REQUEST_SUBMITTED"), "PROCUREMENT_FLOW");
    assert.equal(notificationTypeToEmailCategory("PROCUREMENT_SLA_REMINDER"), "PROCUREMENT_ESCALATION");
    assert.equal(
      notificationTypeToEmailCategory("PURCHASE_ORDER_PENDING_APPROVAL", { highLevelApproval: true }),
      "PROCUREMENT_ESCALATION",
    );
    assert.equal(notificationTypeToEmailCategory("CERTIFICATION_APPROVED"), null);
    assert.equal(notificationTypeToEmailCategory("DOCUMENT_UPLOAD_CONFIRMED"), null);
  });
});

describe("defaultEmailEnabledForCategory", () => {
  it("keeps OA off daily procurement flow and on escalation + digest", () => {
    assert.equal(defaultEmailEnabledForCategory("PROCUREMENT_FLOW", ["OWNER"]), false);
    assert.equal(defaultEmailEnabledForCategory("PROCUREMENT_ESCALATION", ["ADMIN"]), true);
    assert.equal(defaultEmailEnabledForCategory("DAILY_DIGEST", ["OWNER"]), true);
  });

  it("keeps procurement / PM on daily flow", () => {
    assert.equal(defaultEmailEnabledForCategory("PROCUREMENT_FLOW", ["PROCUREMENT"]), true);
    assert.equal(defaultEmailEnabledForCategory("PROCUREMENT_FLOW", ["PROJECT_MANAGER"]), true);
    assert.equal(defaultEmailEnabledForCategory("DAILY_DIGEST", ["PROCUREMENT"]), false);
  });
});

describe("resolveNotificationEmailPreference", () => {
  it("honors explicit user preference over defaults", () => {
    assert.equal(
      resolveNotificationEmailPreference({
        category: "PROCUREMENT_FLOW",
        roles: ["OWNER"],
        userEmailEnabled: true,
      }),
      true,
    );
    assert.equal(
      resolveNotificationEmailPreference({
        category: "PROCUREMENT_FLOW",
        roles: ["PROCUREMENT"],
        userEmailEnabled: false,
      }),
      false,
    );
  });

  it("restores OA daily-flow email when tenant policy CC is on", () => {
    assert.equal(
      resolveNotificationEmailPreference({
        category: "PROCUREMENT_FLOW",
        roles: ["OWNER"],
        leadershipDailyFlowEmailCc: true,
      }),
      true,
    );
  });

  it("uses digestEnabledDefault for OA when no user row", () => {
    assert.equal(
      resolveNotificationEmailPreference({
        category: "DAILY_DIGEST",
        roles: ["ADMIN"],
        digestEnabledDefault: false,
      }),
      false,
    );
  });
});

describe("visibleEmailCategoriesForRoles", () => {
  it("shows all categories to OWNER including digest", () => {
    const cats = visibleEmailCategoriesForRoles(["OWNER"]);
    assert.ok(cats.includes("DAILY_DIGEST"));
    assert.ok(cats.includes("PROCUREMENT_FLOW"));
  });

  it("hides digest and AP payment from SITE_FOREMAN", () => {
    const cats = visibleEmailCategoriesForRoles(["SITE_FOREMAN"]);
    assert.ok(!cats.includes("DAILY_DIGEST"));
    assert.ok(!cats.includes("AP_PAYMENT"));
    assert.ok(cats.includes("JOBSITE_LOG"));
  });
});
