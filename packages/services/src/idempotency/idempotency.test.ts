import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import {
  assertIdempotentPayloadMatch,
  collectionReplayMatches,
  consumptionReplayMatches,
  documentReplayMatches,
  isIdempotencyUniqueConflict,
  pickSameTransactionRow,
  pickCompositePayment,
  pickCompositeCollection,
  paymentReplayMatches,
  registerApExpenseReplayMatches,
  registerArSaleReplayMatches,
  requireIdempotencyKey,
  sha256Hex,
  transferReplayMatches,
  treasuryMovementReplayMatches,
  warehouseTransferReplayMatches,
  withIdempotentCreate,
  purchaseReceiptReplayMatches,
  jobsiteLogReplayMatches,
} from "./idempotency";

const KEY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("requireIdempotencyKey", () => {
  it("normalizes a valid UUID", () => {
    assert.equal(requireIdempotencyKey(KEY_A.toUpperCase()), KEY_A);
  });

  it("rejects missing or non-uuid values", () => {
    assert.throws(
      () => requireIdempotencyKey(undefined),
      (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION",
    );
    assert.throws(
      () => requireIdempotencyKey("not-a-uuid"),
      (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION",
    );
  });
});

describe("payload matchers", () => {
  it("payment: same key + payFullBalance ignores stored amount", () => {
    assert.equal(
      paymentReplayMatches(
        {
          payableId: "p1",
          accountId: "a1",
          paymentDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "100.00" },
          status: "CONFIRMED",
        },
        {
          payableId: "p1",
          accountId: "a1",
          paymentDate: "2026-08-19",
          payFullBalance: true,
          amount: "999.00",
        },
      ),
      true,
    );
  });

  it("payFullBalance replay after a later new obligation still reuses the original 100 (intentional)", () => {
    const original = {
      payableId: "p1",
      accountId: "a1",
      paymentDate: new Date("2026-08-19T00:00:00.000Z"),
      amount: { toString: () => "100.00" },
      status: "CONFIRMED",
    };
    assert.equal(
      paymentReplayMatches(original, {
        payableId: "p1",
        accountId: "a1",
        paymentDate: "2026-08-19",
        payFullBalance: true,
        amount: null,
      }),
      true,
    );
    // Context changed: payable now has a new 50 balance. Replay of key A must still
    // match the stored 100 and must NOT re-resolve current balance.
    assert.equal(
      paymentReplayMatches(original, {
        payableId: "p1",
        accountId: "a1",
        paymentDate: "2026-08-19",
        payFullBalance: true,
        amount: "50.00",
      }),
      true,
    );
    assert.equal(original.amount.toString(), "100.00");
  });

  it("collectFullBalance replay after a later new obligation still reuses the original 100 (intentional)", () => {
    const original = {
      receivableId: "r1",
      accountId: "a1",
      collectionDate: new Date("2026-08-19T00:00:00.000Z"),
      amount: { toString: () => "100.00" },
      status: "CONFIRMED",
    };
    assert.equal(
      collectionReplayMatches(original, {
        receivableId: "r1",
        accountId: "a1",
        collectionDate: "2026-08-19",
        collectFullBalance: true,
        amount: "50.00",
      }),
      true,
    );
    assert.equal(original.amount.toString(), "100.00");
  });

  it("warehouse transfer + treasury movement matchers", () => {
    assert.equal(
      warehouseTransferReplayMatches(
        {
          sourceWarehouseId: "w1",
          destinationWarehouseId: "w2",
          productId: "p1",
          projectId: null,
          transferDate: new Date("2026-08-19T00:00:00.000Z"),
          quantity: { toString: () => "2.0000" },
          status: "CONFIRMED",
        },
        {
          sourceWarehouseId: "w1",
          destinationWarehouseId: "w2",
          productId: "p1",
          projectId: null,
          transferDate: "2026-08-19",
          quantity: "2",
        },
      ),
      true,
    );
    assert.equal(
      treasuryMovementReplayMatches(
        {
          accountId: "a1",
          movementDate: new Date("2026-08-19T00:00:00.000Z"),
          type: "INFLOW",
          amount: { toString: () => "100.00" },
          description: "Ingreso",
          status: "CONFIRMED",
          counterpartyContactId: null,
          externalInvoiceRef: null,
        },
        {
          accountId: "a1",
          movementDate: "2026-08-19",
          type: "INFLOW",
          amount: "100.00",
          description: "Ingreso",
          counterpartyContactId: null,
          externalInvoiceRef: null,
        },
      ),
      true,
    );
  });

  it("payment: same key + different amount is a mismatch", () => {
    assert.equal(
      paymentReplayMatches(
        {
          payableId: "p1",
          accountId: "a1",
          paymentDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "100.00" },
          status: "CONFIRMED",
        },
        {
          payableId: "p1",
          accountId: "a1",
          paymentDate: "2026-08-19",
          payFullBalance: false,
          amount: "200.00",
        },
      ),
      false,
    );
  });

  it("collection / transfer / consumption / document matchers", () => {
    assert.equal(
      collectionReplayMatches(
        {
          receivableId: "r1",
          accountId: "a1",
          collectionDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "50.00" },
          status: "CONFIRMED",
        },
        {
          receivableId: "r1",
          accountId: "a1",
          collectionDate: "2026-08-19",
          collectFullBalance: false,
          amount: "50",
        },
      ),
      true,
    );
    assert.equal(
      transferReplayMatches(
        {
          sourceAccountId: "s",
          destinationAccountId: "d",
          transferDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "10.00" },
          status: "CONFIRMED",
        },
        { sourceAccountId: "s", destinationAccountId: "d", transferDate: "2026-08-19", amount: "10.00" },
      ),
      true,
    );
    assert.equal(
      consumptionReplayMatches(
        {
          warehouseId: "w",
          productId: "p",
          projectId: "proj",
          wbsNodeId: null,
          movementDate: new Date("2026-08-19T00:00:00.000Z"),
          quantity: { toString: () => "2.0000" },
          status: "CONFIRMED",
        },
        {
          warehouseId: "w",
          productId: "p",
          projectId: "proj",
          wbsNodeId: null,
          movementDate: "2026-08-19",
          quantity: "2",
        },
      ),
      true,
    );
    assert.equal(
      documentReplayMatches(
        {
          contentSha256: "abc",
          linkedEntityType: "JOBSITE_LOG",
          linkedEntityId: "log-1",
          status: "ACTIVE",
        },
        { contentSha256: "abc", linkedEntityType: "JOBSITE_LOG", linkedEntityId: "log-1" },
      ),
      true,
    );
    assert.equal(
      documentReplayMatches(
        {
          contentSha256: "abc",
          linkedEntityType: "JOBSITE_LOG",
          linkedEntityId: "log-1",
          status: "ACTIVE",
        },
        { contentSha256: "def", linkedEntityType: "JOBSITE_LOG", linkedEntityId: "log-1" },
      ),
      false,
    );
  });

  it("does not replay cancelled / non-active rows", () => {
    assert.equal(
      paymentReplayMatches(
        {
          payableId: "p1",
          accountId: "a1",
          paymentDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "100.00" },
          status: "CANCELLED",
        },
        {
          payableId: "p1",
          accountId: "a1",
          paymentDate: "2026-08-19",
          payFullBalance: true,
          amount: null,
        },
      ),
      false,
    );
  });
});

describe("withIdempotentCreate concurrency", () => {
  it("10 parallel same-key creates produce one effect", async () => {
    const store = new Map<string, { id: string; tenantId: string; payload: string }>();
    let created = 0;
    const tenantA = "tenant-a";

    async function run(tenantId: string, key: string, payload: string) {
      return withIdempotentCreate({
        findExisting: async () => store.get(`${tenantId}:${key}`) ?? null,
        payloadsMatch: (row) => row.payload === payload,
        create: async () => {
          const k = `${tenantId}:${key}`;
          if (store.has(k)) {
            throw new Prisma.PrismaClientKnownRequestError("unique", {
              code: "P2002",
              clientVersion: "test",
              meta: { target: ["tenantId", "idempotencyKey"] },
            });
          }
          const row = { id: `id-${++created}`, tenantId, payload };
          store.set(k, row);
          return row;
        },
      });
    }

    const results = await Promise.all(Array.from({ length: 10 }, () => run(tenantA, KEY_A, "100.00")));
    assert.equal(created, 1);
    assert.equal(new Set(results.map((r) => r.id)).size, 1);
    assert.equal(store.size, 1);
  });

  it("same key + different payload is CONFLICT", async () => {
    const store = new Map<string, { id: string; payload: string }>();
    store.set(`t:${KEY_A}`, { id: "1", payload: "100.00" });
    await assert.rejects(
      () =>
        withIdempotentCreate({
          findExisting: async () => store.get(`t:${KEY_A}`) ?? null,
          payloadsMatch: (row) => row.payload === "200.00",
          create: async () => {
            throw new Error("should not create");
          },
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("same key in another tenant does not collide", async () => {
    const store = new Map<string, { id: string; tenantId: string; payload: string }>();
    store.set(`tenant-a:${KEY_A}`, { id: "a", tenantId: "tenant-a", payload: "100.00" });
    const row = await withIdempotentCreate({
      findExisting: async () => store.get(`tenant-b:${KEY_A}`) ?? null,
      payloadsMatch: (existing) => existing.payload === "100.00",
      create: async () => {
        const created = { id: "b", tenantId: "tenant-b", payload: "100.00" };
        store.set(`tenant-b:${KEY_A}`, created);
        return created;
      },
    });
    assert.equal(row.id, "b");
    assert.equal(store.size, 2);
  });

  it("new key is an independent operation", async () => {
    const store = new Map<string, { id: string }>();
    await withIdempotentCreate({
      findExisting: async () => store.get(KEY_A) ?? null,
      payloadsMatch: () => true,
      create: async () => {
        const row = { id: "1" };
        store.set(KEY_A, row);
        return row;
      },
    });
    const second = await withIdempotentCreate({
      findExisting: async () => store.get(KEY_B) ?? null,
      payloadsMatch: () => true,
      create: async () => {
        const row = { id: "2" };
        store.set(KEY_B, row);
        return row;
      },
    });
    assert.equal(second.id, "2");
    assert.equal(store.size, 2);
  });

  it("replay does not invoke create side effects (notifications / audit / email)", async () => {
    let createCalls = 0;
    let notifyCalls = 0;
    const row = { id: "pay-1" };
    const first = await withIdempotentCreate({
      findExisting: async () => null,
      payloadsMatch: () => true,
      create: async () => {
        createCalls += 1;
        notifyCalls += 1;
        return row;
      },
    });
    const replay = await withIdempotentCreate({
      findExisting: async () => row,
      payloadsMatch: () => true,
      create: async () => {
        createCalls += 1;
        notifyCalls += 1;
        return { id: "pay-2" };
      },
    });
    assert.equal(first.id, "pay-1");
    assert.equal(replay.id, "pay-1");
    assert.equal(createCalls, 1);
    assert.equal(notifyCalls, 1);
  });
});

describe("isIdempotencyUniqueConflict", () => {
  it("detects P2002 on idempotencyKey", () => {
    const err = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { constraint: "payments_tenant_idempotency_key" },
    });
    assert.equal(isIdempotencyUniqueConflict(err), true);
    const other = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["tenantId", "number"] },
    });
    assert.equal(isIdempotencyUniqueConflict(other), false);
  });
});

const AP_CREATED_AT = new Date("2026-08-19T12:00:00.000Z");
const AP_LINE = {
  description: "Cemento",
  quantity: { toString: () => "2.0000" },
  unitPrice: { toString: () => "100.0000" },
  taxRate: { toString: () => "21.0000" },
  sortOrder: 0,
  wbsNodeId: "wbs-1" as string | null,
  purchaseOrderLineId: null as string | null,
};
const AP_INPUT = {
  projectId: "proj-1",
  supplierContactId: "sup-1",
  issueDate: "2026-08-19",
  dueDate: "2026-08-26",
  currency: "ARS",
  invoiceLetter: "A" as const,
  lines: [
    {
      description: "Cemento",
      quantity: "2",
      unitPrice: "100",
      taxRate: "21",
      sortOrder: 0,
      wbsNodeId: "wbs-1",
    },
  ],
};

function apExisting(overrides: Record<string, unknown> = {}) {
  return {
    status: "ISSUED",
    supplierContactId: "sup-1",
    projectId: "proj-1",
    issueDate: new Date("2026-08-19T00:00:00.000Z"),
    dueDate: new Date("2026-08-26T00:00:00.000Z"),
    currency: "ARS",
    invoiceLetter: "A",
    purchaseOrderId: null,
    createdAt: AP_CREATED_AT,
    payableId: "payable-1",
    lines: [AP_LINE],
    payments: [] as Array<{
      payableId: string;
      accountId: string;
      paymentDate: Date;
      amount: { toString(): string };
      status: string;
      createdAt: Date;
    }>,
    ...overrides,
  };
}

const AR_LINE = {
  description: "Anticipo de obra",
  quantity: { toString: () => "1.0000" },
  unitPrice: { toString: () => "500.0000" },
  taxRate: { toString: () => "0.0000" },
  sortOrder: 0,
  certificationLineId: null as string | null,
};
const AR_INPUT = {
  projectId: "proj-1",
  clientContactId: "cli-1",
  issueDate: "2026-08-19",
  dueDate: "2026-08-19",
  currency: "ARS",
  invoiceLetter: null as string | null,
  externalInvoiceRef: null as string | null,
  lines: [
    {
      description: "Anticipo de obra",
      quantity: "1",
      unitPrice: "500",
      taxRate: "0",
      sortOrder: 0,
    },
  ],
};

function arExisting(overrides: Record<string, unknown> = {}) {
  return {
    status: "ISSUED",
    clientContactId: "cli-1",
    projectId: "proj-1",
    issueDate: new Date("2026-08-19T00:00:00.000Z"),
    dueDate: new Date("2026-08-19T00:00:00.000Z"),
    currency: "ARS",
    invoiceLetter: null as string | null,
    externalInvoiceRef: null as string | null,
    createdAt: AP_CREATED_AT,
    receivableId: "recv-1",
    lines: [AR_LINE],
    collections: [] as Array<{
      receivableId: string;
      accountId: string;
      collectionDate: Date;
      amount: { toString(): string };
      status: string;
      createdAt: Date;
    }>,
    ...overrides,
  };
}

describe("registerApExpenseReplayMatches", () => {
  it("matches header + lines, not total-only", () => {
    assert.equal(registerApExpenseReplayMatches(apExisting(), AP_INPUT), true);
    assert.equal(
      registerApExpenseReplayMatches(apExisting(), {
        ...AP_INPUT,
        lines: [{ ...AP_INPUT.lines[0]!, unitPrice: "200" }],
      }),
      false,
    );
    assert.equal(
      registerApExpenseReplayMatches(apExisting(), { ...AP_INPUT, supplierContactId: "sup-2" }),
      false,
    );
    assert.equal(
      registerApExpenseReplayMatches(apExisting(), { ...AP_INPUT, projectId: "proj-2" }),
      false,
    );
  });

  it("CONFLICT when payNow presence differs; matches nested payment fields", () => {
    const paid = apExisting({
      payments: [
        {
          payableId: "payable-1",
          accountId: "acc-1",
          paymentDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "242.00" },
          status: "CONFIRMED",
          createdAt: AP_CREATED_AT,
        },
      ],
    });
    assert.equal(registerApExpenseReplayMatches(paid, AP_INPUT), false);
    assert.equal(
      registerApExpenseReplayMatches(paid, {
        ...AP_INPUT,
        payNow: {
          accountId: "acc-1",
          paymentDate: "2026-08-19",
          payFullBalance: true,
          amount: null,
        },
      }),
      true,
    );
    assert.equal(
      registerApExpenseReplayMatches(paid, {
        ...AP_INPUT,
        payNow: {
          accountId: "acc-2",
          paymentDate: "2026-08-19",
          payFullBalance: true,
          amount: null,
        },
      }),
      false,
    );
  });

  it("does not match DRAFT (no obligation)", () => {
    assert.equal(registerApExpenseReplayMatches(apExisting({ status: "DRAFT", payableId: null }), AP_INPUT), false);
  });
});

describe("pickSameTransactionRow", () => {
  const parent = new Date("2026-08-19T12:00:00.000Z");

  it("matches exact createdAt and a small clock skew, not a later independent row", () => {
    const exact = { id: "a", createdAt: parent };
    const skewed = { id: "b", createdAt: new Date(parent.getTime() + 400) };
    const later = { id: "c", createdAt: new Date(parent.getTime() + 60_000) };
    assert.equal(pickSameTransactionRow(parent, [exact])?.id, "a");
    assert.equal(pickSameTransactionRow(parent, [skewed])?.id, "b");
    assert.equal(pickSameTransactionRow(parent, [later]), undefined);
  });
});

describe("pickCompositePayment / pickCompositeCollection", () => {
  const parent = new Date("2026-08-19T12:00:00.000Z");

  it("without payNow only uses the composite window", () => {
    const later = {
      payableId: "pay-1",
      accountId: "acc-1",
      paymentDate: new Date("2026-08-19T00:00:00.000Z"),
      amount: { toString: () => "100.00" },
      status: "CONFIRMED",
      createdAt: new Date(parent.getTime() + 60_000),
    };
    assert.equal(pickCompositePayment(parent, "pay-1", [later])?.accountId, undefined);
  });

  it("with payNow finds a matching settlement after clock skew", () => {
    const later = {
      payableId: "pay-1",
      accountId: "acc-1",
      paymentDate: new Date("2026-08-19T00:00:00.000Z"),
      amount: { toString: () => "100.00" },
      status: "CONFIRMED",
      createdAt: new Date(parent.getTime() + 60_000),
    };
    assert.equal(
      pickCompositePayment(parent, "pay-1", [later], {
        accountId: "acc-1",
        paymentDate: "2026-08-19",
        payFullBalance: true,
      })?.accountId,
      "acc-1",
    );
    const collection = {
      receivableId: "recv-1",
      accountId: "acc-2",
      collectionDate: new Date("2026-08-19T00:00:00.000Z"),
      amount: { toString: () => "50.00" },
      status: "CONFIRMED",
      createdAt: new Date(parent.getTime() + 60_000),
    };
    assert.equal(
      pickCompositeCollection(parent, "recv-1", [collection], {
        accountId: "acc-2",
        collectionDate: "2026-08-19",
        collectFullBalance: true,
      })?.accountId,
      "acc-2",
    );
  });
});

describe("registerArSaleReplayMatches", () => {
  it("matches header + lines; CONFLICT on amount / client / project", () => {
    assert.equal(registerArSaleReplayMatches(arExisting(), AR_INPUT), true);
    assert.equal(
      registerArSaleReplayMatches(arExisting(), {
        ...AR_INPUT,
        lines: [{ ...AR_INPUT.lines[0]!, unitPrice: "600" }],
      }),
      false,
    );
    assert.equal(
      registerArSaleReplayMatches(arExisting(), { ...AR_INPUT, clientContactId: "cli-2" }),
      false,
    );
  });

  it("CONFLICT when collectNow presence differs", () => {
    const collected = arExisting({
      collections: [
        {
          receivableId: "recv-1",
          accountId: "acc-1",
          collectionDate: new Date("2026-08-19T00:00:00.000Z"),
          amount: { toString: () => "500.00" },
          status: "CONFIRMED",
          createdAt: AP_CREATED_AT,
        },
      ],
    });
    assert.equal(registerArSaleReplayMatches(collected, AR_INPUT), false);
    assert.equal(
      registerArSaleReplayMatches(collected, {
        ...AR_INPUT,
        collectNow: {
          accountId: "acc-1",
          collectionDate: "2026-08-19",
          collectFullBalance: true,
          amount: null,
        },
      }),
      true,
    );
  });
});

describe("register AP/AR composite concurrency", () => {
  type ApRow = {
    invoiceId: string;
    payableId: string;
    tenantId: string;
    payload: string;
  };

  async function runAp(
    store: Map<string, ApRow>,
    counters: { invoices: number; payables: number; notify: number },
    tenantId: string,
    key: string,
    payload: string,
  ) {
    return withIdempotentCreate({
      findExisting: async () => store.get(`${tenantId}:${key}`) ?? null,
      payloadsMatch: (row) => row.payload === payload,
      create: async () => {
        const k = `${tenantId}:${key}`;
        if (store.has(k)) {
          throw new Prisma.PrismaClientKnownRequestError("unique", {
            code: "P2002",
            clientVersion: "test",
            meta: { constraint: "supplier_invoices_tenant_idempotency_key" },
          });
        }
        const row: ApRow = {
          invoiceId: `inv-${++counters.invoices}`,
          payableId: `pay-${++counters.payables}`,
          tenantId,
          payload,
        };
        store.set(k, row);
        counters.notify += 1;
        return row;
      },
    });
  }

  it("10 concurrent same-key AP requests → 1 invoice, 1 payable, notify once", async () => {
    const store = new Map<string, ApRow>();
    const counters = { invoices: 0, payables: 0, notify: 0 };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => runAp(store, counters, "tenant-a", KEY_A, "cemento-100")),
    );
    assert.equal(counters.invoices, 1);
    assert.equal(counters.payables, 1);
    assert.equal(counters.notify, 1);
    assert.equal(new Set(results.map((r) => r.invoiceId)).size, 1);
    assert.equal(new Set(results.map((r) => r.payableId)).size, 1);
  });

  it("AP replay returns the same invoice/payable and does not notify again", async () => {
    const store = new Map<string, ApRow>();
    const counters = { invoices: 0, payables: 0, notify: 0 };
    const first = await runAp(store, counters, "tenant-a", KEY_A, "cemento-100");
    const replay = await runAp(store, counters, "tenant-a", KEY_A, "cemento-100");
    assert.equal(replay.invoiceId, first.invoiceId);
    assert.equal(replay.payableId, first.payableId);
    assert.equal(counters.invoices, 1);
    assert.equal(counters.notify, 1);
  });

  it("AP same key + different payload is CONFLICT; new key is a second operation", async () => {
    const store = new Map<string, ApRow>();
    const counters = { invoices: 0, payables: 0, notify: 0 };
    await runAp(store, counters, "tenant-a", KEY_A, "cemento-100");
    await assert.rejects(
      () => runAp(store, counters, "tenant-a", KEY_A, "cemento-200"),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
    const second = await runAp(store, counters, "tenant-a", KEY_B, "cemento-100");
    assert.equal(counters.invoices, 2);
    assert.equal(second.invoiceId, "inv-2");
  });

  it("AP same UUID in two tenants does not collide or leak", async () => {
    const store = new Map<string, ApRow>();
    const counters = { invoices: 0, payables: 0, notify: 0 };
    const a = await runAp(store, counters, "tenant-a", KEY_A, "cemento-100");
    const b = await runAp(store, counters, "tenant-b", KEY_A, "cemento-100");
    assert.notEqual(a.invoiceId, b.invoiceId);
    assert.equal(store.size, 2);
    assert.equal(a.tenantId, "tenant-a");
    assert.equal(b.tenantId, "tenant-b");
  });

  type ArRow = {
    invoiceId: string;
    receivableId: string;
    tenantId: string;
    payload: string;
  };

  async function runAr(
    store: Map<string, ArRow>,
    counters: { invoices: number; receivables: number; notify: number },
    tenantId: string,
    key: string,
    payload: string,
  ) {
    return withIdempotentCreate({
      findExisting: async () => store.get(`${tenantId}:${key}`) ?? null,
      payloadsMatch: (row) => row.payload === payload,
      create: async () => {
        const k = `${tenantId}:${key}`;
        if (store.has(k)) {
          throw new Prisma.PrismaClientKnownRequestError("unique", {
            code: "P2002",
            clientVersion: "test",
            meta: { constraint: "sales_invoices_tenant_idempotency_key" },
          });
        }
        const row: ArRow = {
          invoiceId: `fac-${++counters.invoices}`,
          receivableId: `recv-${++counters.receivables}`,
          tenantId,
          payload,
        };
        store.set(k, row);
        counters.notify += 1;
        return row;
      },
    });
  }

  it("10 concurrent same-key AR requests → 1 invoice, 1 receivable, notify once", async () => {
    const store = new Map<string, ArRow>();
    const counters = { invoices: 0, receivables: 0, notify: 0 };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => runAr(store, counters, "tenant-a", KEY_A, "sale-500")),
    );
    assert.equal(counters.invoices, 1);
    assert.equal(counters.receivables, 1);
    assert.equal(counters.notify, 1);
    assert.equal(new Set(results.map((r) => r.invoiceId)).size, 1);
    assert.equal(new Set(results.map((r) => r.receivableId)).size, 1);
  });

  it("AR replay + new key + cross-tenant", async () => {
    const store = new Map<string, ArRow>();
    const counters = { invoices: 0, receivables: 0, notify: 0 };
    const first = await runAr(store, counters, "tenant-a", KEY_A, "sale-500");
    const replay = await runAr(store, counters, "tenant-a", KEY_A, "sale-500");
    assert.equal(replay.invoiceId, first.invoiceId);
    assert.equal(replay.receivableId, first.receivableId);
    assert.equal(counters.notify, 1);
    await assert.rejects(
      () => runAr(store, counters, "tenant-a", KEY_A, "sale-600"),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
    const second = await runAr(store, counters, "tenant-a", KEY_B, "sale-500");
    assert.equal(second.invoiceId, "fac-2");
    const otherTenant = await runAr(store, counters, "tenant-b", KEY_A, "sale-500");
    assert.notEqual(otherTenant.invoiceId, first.invoiceId);
    assert.equal(store.size, 3);
  });
});

describe("sha256Hex", () => {
  it("hashes file bytes, not the filename", () => {
    assert.notEqual(sha256Hex(Buffer.from("photo-a")), sha256Hex(Buffer.from("photo-b")));
    assert.equal(sha256Hex(Buffer.from("same")), sha256Hex(Buffer.from("same")));
  });
});

describe("assertIdempotentPayloadMatch", () => {
  it("throws CONFLICT when false", () => {
    assert.throws(
      () => assertIdempotentPayloadMatch(false),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
    assert.doesNotThrow(() => assertIdempotentPayloadMatch(true));
  });
});

describe("purchaseReceiptReplayMatches", () => {
  const base = {
    purchaseOrderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    warehouseId: null as string | null,
    receiptDate: new Date("2026-08-20T00:00:00.000Z"),
    notes: null as string | null,
    lines: [{ purchaseOrderLineId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quantityReceived: "2.5" }],
  };

  it("matches same payload", () => {
    assert.equal(
      purchaseReceiptReplayMatches(base, {
        purchaseOrderId: base.purchaseOrderId,
        warehouseId: null,
        receiptDate: "2026-08-20",
        notes: null,
        lines: [{ purchaseOrderLineId: base.lines[0]!.purchaseOrderLineId, quantityReceived: "2.5" }],
      }),
      true,
    );
  });

  it("rejects different qty", () => {
    assert.equal(
      purchaseReceiptReplayMatches(base, {
        purchaseOrderId: base.purchaseOrderId,
        receiptDate: "2026-08-20",
        lines: [{ purchaseOrderLineId: base.lines[0]!.purchaseOrderLineId, quantityReceived: "3" }],
      }),
      false,
    );
  });
});

describe("jobsiteLogReplayMatches", () => {
  const base = {
    projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    logDate: new Date("2026-08-20T00:00:00.000Z"),
    title: "Parte",
    workFront: null as string | null,
    shift: null as string | null,
    weather: null as string | null,
    generalNotes: "ok",
    blockers: null as string | null,
    incidents: null as string | null,
    safetyNotes: null as string | null,
    progress: [] as Array<{
      wbsNodeId: string;
      quantityCompleted: { toString(): string };
      physicalPct: { toString(): string } | null;
    }>,
    labor: [] as Array<{
      contactId: string | null;
      subcontractId: string | null;
      workersCount: number;
      hoursWorked: { toString(): string } | null;
    }>,
    materials: [] as Array<{
      productId: string | null;
      warehouseId: string | null;
      quantity: { toString(): string };
    }>,
    issues: [] as Array<{ type: string; severity: string; description: string }>,
  };

  it("matches header-only create", () => {
    assert.equal(
      jobsiteLogReplayMatches(base, {
        projectId: base.projectId,
        companyId: base.companyId,
        logDate: "2026-08-20",
        title: "Parte",
        generalNotes: "ok",
        blockers: null,
        incidents: null,
        safetyNotes: null,
      }),
      true,
    );
  });

  it("rejects different title", () => {
    assert.equal(
      jobsiteLogReplayMatches(base, {
        projectId: base.projectId,
        companyId: base.companyId,
        logDate: "2026-08-20",
        title: "Otro",
        generalNotes: "ok",
      }),
      false,
    );
  });
});
