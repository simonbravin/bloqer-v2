import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { cancelPayment, getPaymentById, listPaymentsByPayable } from "../ap/payment.service";
import { cancelCollection } from "../treasury/collection.service";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";

const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("payment and collection access boundaries", { concurrency: false }, () => {
  const ctx: ServiceContext = {
    actorUserId: "user", tenantId: "tenant", companyId: "company", roles: ["FINANCE"],
  };
  const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";
  const financialGuard = new Error("Reached financial checks");
  let tenantId: string;
  let companyId: string;
  let projectId: string | null;
  let membership: { id: string } | null;
  let status: "CONFIRMED" | "CANCELLED";
  let paymentReads: number;
  let financialChecks: number;
  let journalChecks: number;

  beforeEach(() => {
    tenantId = "tenant";
    companyId = "company";
    projectId = "project";
    membership = null;
    status = "CONFIRMED";
    paymentReads = financialChecks = journalChecks = 0;
    clearProjectAccessModeCache();
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.tenant, "findUnique", async () => ({ projectAccessMode: "MEMBERSHIP_SCOPED" }));
    stub(prisma.project, "findUnique", async () => ({
      id: "project", tenantId, companyId, status: "ACTIVE", country: "AR",
    }));
    stub(prisma.projectMembership, "findUnique", async () => membership);
    const document = () => ({
      id: "document", tenantId, companyId, projectId, status,
      paymentDate: new Date("2026-10-08"), collectionDate: new Date("2026-10-08"),
      amount: new Prisma.Decimal("10"), account: { name: "Bank" },
    });
    stub(prisma.payment, "findUnique", async () => document());
    stub(prisma.collection, "findUnique", async () => document());
    stub(prisma.payable, "findUnique", async () => document());
    stub(prisma.payment, "findMany", async () => { paymentReads++; return [document()]; });
    stub(prisma.period, "findFirst", async () => { financialChecks++; throw financialGuard; });
    stub(prisma.journalEntry, "findFirst", async () => { journalChecks++; throw financialGuard; });
    stub(prisma, "$transaction", async () => {
      throw new Error("Unexpected financial write");
    });
  });
  afterEach(() => {
    restore.splice(0).reverse().forEach(fn => fn());
    clearProjectAccessModeCache();
  });

  for (const [name, cancel] of Object.entries({ payment: cancelPayment, collection: cancelCollection })) {
    it(`${name}: rejects an unassigned user before financial checks`, async () => {
      await assert.rejects(() => cancel("document", ctx, "project"), forbidden);
      assert.equal(financialChecks, 0);
      assert.equal(journalChecks, 0);
    });
    it(`${name}: cannot bypass membership by omitting the route scope`, async () => {
      await assert.rejects(() => cancel("document", ctx), forbidden);
      assert.equal(financialChecks, 0);
    });
    it(`${name}: rejects an unassigned user even when already cancelled`, async () => {
      status = "CANCELLED";
      await assert.rejects(() => cancel("document", ctx), forbidden);
      assert.equal(journalChecks, 0);
    });
    it(`${name}: a member reaches the existing financial safeguards`, async () => {
      membership = { id: "membership" };
      await assert.rejects(() => cancel("document", ctx, "project"), error => error === financialGuard);
      assert.equal(financialChecks, 1);
    });
    it(`${name}: preserves tenant-wide administrator access`, async () => {
      await assert.rejects(() => cancel("document", { ...ctx, roles: ["ADMIN"] }), error => error === financialGuard);
      assert.equal(financialChecks, 1);
    });
    it(`${name}: preserves corporate finance access without project membership`, async () => {
      projectId = null;
      await assert.rejects(() => cancel("document", ctx), error => error === financialGuard);
      assert.equal(financialChecks, 1);
    });
  }

  for (const [name, read] of Object.entries({
    detail: getPaymentById,
    payablePayments: listPaymentsByPayable,
  })) {
    it(`${name}: denies another tenant`, async () => {
      tenantId = "other-tenant";
      await assert.rejects(() => read("document", ctx), forbidden);
      assert.equal(paymentReads, 0);
    });
    it(`${name}: denies another active company`, async () => {
      companyId = "other-company";
      await assert.rejects(() => read("document", ctx), forbidden);
      assert.equal(paymentReads, 0);
    });
    it(`${name}: requires project membership`, async () => {
      await assert.rejects(() => read("document", ctx), forbidden);
      assert.equal(paymentReads, 0);
    });
    it(`${name}: rejects a different project route`, async () => {
      membership = { id: "membership" };
      await assert.rejects(() => read("document", ctx, "other-project"), forbidden);
      assert.equal(paymentReads, 0);
    });
    it(`${name}: denies corporate data to project-only finance`, async () => {
      projectId = null;
      await assert.rejects(() => read("document", { ...ctx, roles: ["PROJECT_FINANCE"] }), forbidden);
      assert.equal(paymentReads, 0);
    });
    it(`${name}: permits assigned project finance`, async () => {
      membership = { id: "membership" };
      assert.ok(await read("document", { ...ctx, roles: ["PROJECT_FINANCE"] }, "project"));
    });
    it(`${name}: permits corporate finance`, async () => {
      projectId = null;
      assert.ok(await read("document", ctx));
    });
  }
});
