import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { can } from "@bloqer/domain";
import {
  canViewProcurementProjectArea,
  canViewPurchaseRequests,
} from "../procurement/procurement-access";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewArProjectArea } from "../ar/ar-access";
import { canViewCompanyTreasury, canViewTreasury } from "../finance/finance-access";
import {
  canViewProjectDocuments,
  canViewProcurementCapability,
  canViewProjectFinancialsCapability,
  hasTenantWideProjectAccess,
} from "../security/access";

describe("D-111 G1-C procurement vs projects", () => {
  it("VIEW PROJECTS alone does not grant procurement", () => {
    assert.equal(canViewProcurementProjectArea(["PROJECT_VIEWER"]), false);
    assert.equal(canViewProcurementCapability(["PROJECT_VIEWER"]), false);
    assert.equal(can(["PROJECT_VIEWER"], "VIEW", "PROJECTS"), true);
  });

  it("PROJECT_MANAGER keeps procurement via PROCUREMENT module", () => {
    assert.equal(canViewProcurementProjectArea(["PROJECT_MANAGER"]), true);
    assert.equal(canViewPurchaseRequests(["PROJECT_MANAGER"]), true);
  });

  it("SITE_FOREMAN keeps purchase requests via PURCHASE_REQUESTS", () => {
    assert.equal(canViewPurchaseRequests(["SITE_FOREMAN"]), true);
    assert.equal(canViewProcurementProjectArea(["SITE_FOREMAN"]), false);
  });

  it("documents still allow VIEW PROJECTS", () => {
    assert.equal(canViewProjectDocuments(["PROJECT_VIEWER"]), true);
  });
});

describe("D-111 G4 project financials capability", () => {
  it("VIEW PROJECTS alone does not grant project AP/AR", () => {
    assert.equal(canViewApProjectArea(["PROJECT_VIEWER"]), false);
    assert.equal(canViewArProjectArea(["PROJECT_VIEWER"]), false);
    // PROJECT_VIEWER has BUDGETS/CERTIFICATIONS → financial capability yes for those modules
    assert.equal(canViewProjectFinancialsCapability(["PROJECT_VIEWER"]), true);
  });

  it("PROJECT_MANAGER has project financials via AP/AR/BUDGETS", () => {
    assert.equal(canViewApProjectArea(["PROJECT_MANAGER"]), true);
    assert.equal(canViewProjectFinancialsCapability(["PROJECT_MANAGER"]), true);
  });
});

describe("D-111 G2 treasury permission", () => {
  it("VIEWER lacks VIEW TREASURY; OWNER/FINANCE/TREASURER have it", () => {
    assert.equal(can(["VIEWER"], "VIEW", "TREASURY"), false);
    assert.equal(canViewTreasury(["VIEWER"]), false);
    assert.equal(canViewCompanyTreasury(["VIEWER"]), false);
    assert.equal(canViewTreasury(["OWNER"]), true);
    assert.equal(canViewTreasury(["FINANCE"]), true);
    assert.equal(canViewTreasury(["TREASURER"]), true);
  });
});

describe("D-111 tenant-wide project access", () => {
  it("uses APPROVE PROJECTS / users — not role === OWNER", () => {
    assert.equal(hasTenantWideProjectAccess(["OWNER"]), true);
    assert.equal(hasTenantWideProjectAccess(["ADMIN"]), true);
    assert.equal(hasTenantWideProjectAccess(["PROJECT_MANAGER"]), false);
    assert.equal(hasTenantWideProjectAccess(["FINANCE"]), false);
    assert.equal(hasTenantWideProjectAccess(["VIEWER"]), false);
  });
});
