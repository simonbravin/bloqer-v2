import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerArIncomeSchema, registerTransactionSchema } from "@bloqer/validators";
import { canEditCompanyAr, canViewCompanyAr } from "./ar-access";
import { AGING_AR_COMPANY_PROJECT_LABEL } from "../aging/aging.service";
import { COMPANY_AR_PROJECT_LABEL } from "./receivable.service";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const REGISTER_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("registerArIncomeSchema (D-051)", () => {
  it("accepts corporate invoice without projectId", () => {
    const parsed = registerArIncomeSchema.safeParse({
      clientContactId: CLIENT_ID,
      issueDate: "2026-07-21",
      dueDate: "2026-08-21",
      currency: "ARS",
      idempotencyKey: REGISTER_KEY,
      externalInvoiceRef: "FC A 0001-00001234",
      lines: [
        {
          description: "Capacitación seguridad",
          quantity: "1",
          unitPrice: "150000",
          taxRate: "21",
        },
      ],
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.externalInvoiceRef, "FC A 0001-00001234");
      assert.equal(parsed.data.lines.length, 1);
    }
  });

  it("accepts dueDate equal to issueDate", () => {
    const parsed = registerArIncomeSchema.safeParse({
      clientContactId: CLIENT_ID,
      issueDate: "2026-07-21",
      dueDate: "2026-07-21",
      idempotencyKey: REGISTER_KEY,
      lines: [{ description: "Servicio", quantity: "1", unitPrice: "100", taxRate: "0" }],
    });
    assert.equal(parsed.success, true);
  });

  it("rejects empty lines", () => {
    const parsed = registerArIncomeSchema.safeParse({
      clientContactId: CLIENT_ID,
      issueDate: "2026-07-21",
      dueDate: "2026-08-21",
      lines: [],
    });
    assert.equal(parsed.success, false);
  });

  it("accepts optional collectNow", () => {
    const parsed = registerArIncomeSchema.safeParse({
      clientContactId: CLIENT_ID,
      issueDate: "2026-07-21",
      dueDate: "2026-08-21",
      idempotencyKey: REGISTER_KEY,
      lines: [{ description: "Materiales", quantity: "2", unitPrice: "1000", taxRate: "21" }],
      collectNow: {
        accountId: ACCOUNT_ID,
        collectionDate: "2026-07-21",
        idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    assert.equal(parsed.success, true);
  });

  it("registers under registerTransactionSchema as AR_INCOME", () => {
    const parsed = registerTransactionSchema.safeParse({
      kind: "AR_INCOME",
      idempotencyKey: REGISTER_KEY,
      clientContactId: CLIENT_ID,
      issueDate: "2026-07-21",
      dueDate: "2026-08-21",
      lines: [{ description: "Servicio", quantity: "1", unitPrice: "5000", taxRate: "0" }],
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.kind, "AR_INCOME");
    }
  });
});

describe("company AR access", () => {
  it("canEditCompanyAr requires company-finance role + EDIT AR (D-056)", () => {
    assert.equal(canEditCompanyAr(["FINANCE"]), true);
    assert.equal(canEditCompanyAr(["TREASURER"]), true);
    assert.equal(canEditCompanyAr(["SALES"]), false);
    assert.equal(canEditCompanyAr(["PROJECT_MANAGER"]), false);
    assert.equal(canEditCompanyAr(["PROJECT_FINANCE"]), false);
    assert.equal(canEditCompanyAr(["SITE_FOREMAN"]), false);
  });

  it("canViewCompanyAr requires company-finance role + VIEW AR (D-056)", () => {
    assert.equal(canViewCompanyAr(["VIEWER"]), true);
    assert.equal(canViewCompanyAr(["TREASURER"]), true);
    assert.equal(canViewCompanyAr(["SALES"]), false);
    assert.equal(canViewCompanyAr(["PROJECT_MANAGER"]), false);
    assert.equal(canViewCompanyAr(["SITE_FOREMAN"]), false);
  });
});

describe("corporate AR labels", () => {
  it("aging and list labels match product copy", () => {
    assert.equal(AGING_AR_COMPANY_PROJECT_LABEL, "Empresa");
    assert.equal(COMPANY_AR_PROJECT_LABEL, "Empresa");
  });
});
