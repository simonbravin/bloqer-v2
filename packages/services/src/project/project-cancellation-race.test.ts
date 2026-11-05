/**
 * Lifecycle/document race regressions using real services and controlled
 * in-memory row locks. No database access. The SQL suite verifies actual locks.
 */
import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma, Prisma } from "@bloqer/database";
import { createCertification } from "../certification/certification.service";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { cancelProject } from "./project.service";

const projectId = "00000000-0000-0000-0000-000000000001";
const tenantId = "00000000-0000-0000-0000-000000000002";
const companyId = "00000000-0000-0000-0000-000000000003";
const budgetId = "00000000-0000-0000-0000-000000000004";
const ctx: ServiceContext = { tenantId, companyId, actorUserId: "synthetic-actor", roles: ["OWNER"] };
const certificationInput = { projectId, budgetId, periodStart: "2026-02-01", periodEnd: "2026-02-28" };

function stub(t: TestContext, target: object, key: string, replacement: unknown): void {
  const delegate = target as Record<string, unknown>;
  const original = delegate[key];
  delegate[key] = replacement;
  t.after(() => { delegate[key] = original; });
}

function setup(t: TestContext) {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  const state = {
    project: {
      id: projectId, tenantId, companyId, status: "ACTIVE", code: "AUDIT-RACE", name: "Synthetic race",
      updatedAt: new Date("2026-01-01"), statusBeforeCancellation: null as string | null,
    },
    certifications: [] as Array<{ status: string }>,
    beforeCertificationCreate: undefined as (() => Promise<void>) | undefined,
    onProjectLockWait: undefined as (() => void) | undefined,
  };
  let lockTail = Promise.resolve();
  let lockHeld = false;
  stub(t, prisma.tenantModuleSetting, "findMany", async () => []);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: "TENANT_WIDE" }));
  stub(t, prisma.company, "findFirst", async () => ({ id: companyId }));
  stub(t, prisma.company, "findMany", async () => [{ id: companyId }]);
  stub(t, prisma.project, "findUnique", async () => ({ ...state.project }));
  const budget = () => ({ id: budgetId, tenantId, projectId, companyId, company: { id: companyId, tenantId }, currency: "ARS", status: "APPROVED" });
  stub(t, prisma.budget, "findFirst", async () => budget());
  stub(t, prisma.auditLog, "create", async () => ({ id: "audit" }));
  for (const delegate of [prisma.purchaseOrder, prisma.purchaseRequest, prisma.supplierInvoice, prisma.salesInvoice, prisma.collection, prisma.payment, prisma.receivable, prisma.payable, prisma.subcontract]) {
    stub(t, delegate, "count", async () => 0);
  }
  stub(t, prisma.certification, "count", async () => state.certifications.length);
  stub(t, prisma, "$transaction", async (operation: (transaction: unknown) => Promise<unknown>) => {
    let releaseLock: (() => void) | undefined;
    const transaction = {
      $queryRaw: async () => {
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
        if (lockHeld) state.onProjectLockWait?.();
        await previous;
        lockHeld = true;
        return [{ id: projectId }];
      },
      project: {
        updateMany: async ({ where, data }: {
          where: { status: string; updatedAt: Date };
          data: { status: string; statusBeforeCancellation?: string };
        }) => {
          if (where.status !== state.project.status || where.updatedAt.getTime() !== state.project.updatedAt.getTime()) return { count: 0 };
          state.project = { ...state.project, ...data, updatedAt: new Date(state.project.updatedAt.getTime() + 1) };
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ ...state.project }),
        findFirst: async () => ({ ...state.project }),
      },
      certification: {
        aggregate: async () => ({ _max: { number: null } }),
        count: async () => state.certifications.length,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          await state.beforeCertificationCreate?.();
          state.certifications.push({ status: "DRAFT" });
          return {
            ...data, id: "synthetic-certification", status: "DRAFT", issueDate: null,
            totalAmount: new Prisma.Decimal(0), budget: { currency: "ARS" }, lines: [],
            createdAt: new Date(), updatedAt: new Date(),
          };
        },
      },
      budget: { findFirst: async () => budget() },
      company: { findFirst: async () => ({ id: companyId }) },
      ...Object.fromEntries(["purchaseOrder", "purchaseRequest", "supplierInvoice", "salesInvoice", "collection", "payment", "receivable", "payable", "subcontract"].map((name) => [name, { count: async () => 0 }])),
      auditLog: { create: async () => ({ id: "audit" }) },
    };
    try {
      return await operation(transaction);
    } finally {
      if (releaseLock) { lockHeld = false; releaseLock(); }
    }
  });
  return state;
}

describe("AG-03 controlled cancellation/certification race (no database)", { concurrency: false }, () => {
  it("rejects a certification started after cancellation (ordered control)", async (t) => {
    const state = setup(t);
    await cancelProject(projectId, ctx, { reason: "Synthetic cancellation" });
    await assert.rejects(() => createCertification(certificationInput, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    assert.equal(state.certifications.length, 0);
  });

  it("prevents a certification from committing after its ACTIVE check raced cancellation", { timeout: 10_000 }, async (t) => {
    const state = setup(t);
    let announceGuardPassed!: () => void;
    let releaseCertification!: () => void;
    const guardPassed = new Promise<void>((resolve) => { announceGuardPassed = resolve; });
    const release = new Promise<void>((resolve) => { releaseCertification = resolve; });
    stub(t, prisma.budget, "findFirst", async () => {
      // The actual createCertification calls this only after its ACTIVE guard.
      announceGuardPassed();
      await release;
      return { id: budgetId, tenantId, projectId, companyId, company: { id: companyId, tenantId }, currency: "ARS", status: "APPROVED" };
    });
    const creation = createCertification(certificationInput, ctx)
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
    await guardPassed;
    try {
      await cancelProject(projectId, ctx, { reason: "Concurrent synthetic cancellation" });
    } finally {
      releaseCertification();
    }
    const result = await creation;
    t.diagnostic(`Final project=${state.project.status}; new certifications=${state.certifications.length}; creation succeeded=${result.ok}`);
    assert.equal(state.project.status, "CANCELLED");
    assert.equal(result.ok, false, "Certification must re-check/coordinate project state before committing");
    assert.equal(state.certifications.length, 0);
  });

  it("waits for a certification already writing and then rejects cancellation", { timeout: 10_000 }, async (t) => {
    const state = setup(t);
    let writing!: () => void;
    let release!: () => void;
    let waiting!: () => void;
    const writeReached = new Promise<void>((resolve) => { writing = resolve; });
    const finishWrite = new Promise<void>((resolve) => { release = resolve; });
    const cancellationWaiting = new Promise<void>((resolve) => { waiting = resolve; });
    state.beforeCertificationCreate = async () => { writing(); await finishWrite; };
    state.onProjectLockWait = waiting;
    const creation = createCertification(certificationInput, ctx);
    await writeReached;
    const cancellation = cancelProject(projectId, ctx, { reason: "Concurrent cancellation" })
      .then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
    try { await cancellationWaiting; } finally { release(); }
    await creation;
    const result = await cancellation;
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error instanceof ServiceError && result.error.code === "CONFLICT");
    assert.equal(state.project.status, "ACTIVE");
    assert.equal(state.certifications.length, 1);
  });
});
