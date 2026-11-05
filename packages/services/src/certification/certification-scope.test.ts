import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError, type ServiceContext } from "../types";
import { assertCertificationRelations, type CertificationRecord } from "./certification-scope";

const ctx = {
  tenantId: "tenant",
  companyId: "A",
  actorUserId: "actor",
  roles: ["OWNER"],
} as ServiceContext;
function record(): CertificationRecord {
  return {
    id: "cert",
    tenantId: "tenant",
    companyId: "A",
    company: { id: "A", tenantId: "tenant" },
    projectId: "project",
    budgetId: "budget",
    project: { id: "project", tenantId: "tenant", companyId: null, company: null },
    budget: {
      id: "budget",
      tenantId: "tenant",
      companyId: null,
      company: null,
      projectId: "project",
      currency: "ARS",
      status: "APPROVED",
    },
    lines: [
      {
        certificationId: "cert",
        wbsNodeId: "node",
        wbsNode: {
          id: "node",
          budgetId: "budget",
          type: "ITEM",
          costItem: { budgetId: "budget", wbsNodeId: "node" },
        },
      },
    ],
  } as unknown as CertificationRecord;
}
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
test("certification scope preserves shared roots and shared baselines", () => {
  const cert = record();
  cert.companyId = null;
  cert.company = null;
  assert.doesNotThrow(() => assertCertificationRelations(cert, ctx));
  assert.doesNotThrow(() => assertCertificationRelations(record(), { ...ctx, companyId: null }));
});
test("a shared project never grants another company access to a certificate", () => {
  const cert = record();
  cert.companyId = "B";
  cert.company = { id: "B", tenantId: "tenant" };
  assert.throws(
    () => assertCertificationRelations(cert, ctx),
    (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN",
  );
});
test("certification refuses a foreign-tenant company, project or budget before exposing a DTO", () => {
  for (const mutate of [
    (c: CertificationRecord) => {
      c.company!.tenantId = "foreign";
    },
    (c: CertificationRecord) => {
      c.project.tenantId = "foreign";
    },
    (c: CertificationRecord) => {
      c.budget.tenantId = "foreign";
    },
  ]) {
    const cert = record();
    mutate(cert);
    assert.throws(() => assertCertificationRelations(cert, ctx), conflict);
  }
});
test("certification refuses contradictory WBS and CostItem parents", () => {
  for (const mutate of [
    (c: CertificationRecord) => {
      c.budget.projectId = "other";
    },
    (c: CertificationRecord) => {
      c.lines[0]!.wbsNode.budgetId = "other";
    },
    (c: CertificationRecord) => {
      c.lines[0]!.wbsNode.costItem!.budgetId = "other";
    },
    (c: CertificationRecord) => {
      c.lines[0]!.wbsNode.costItem!.wbsNodeId = "other";
    },
  ]) {
    const cert = record();
    mutate(cert);
    assert.throws(() => assertCertificationRelations(cert, ctx), conflict);
  }
});
test("a global caller cannot legitimize contradictory non-null parent companies", () => {
  const cert = record();
  cert.budget.companyId = "B";
  cert.budget.company = { id: "B", tenantId: "tenant" };
  assert.throws(() => assertCertificationRelations(cert, { ...ctx, companyId: null }), conflict);
});
