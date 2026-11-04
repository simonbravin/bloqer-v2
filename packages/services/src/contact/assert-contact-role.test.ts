import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma, type Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import {
  assertContactHasAnyMatchingRole,
  assertContactRoleMatchesTenant,
  assertContactRoleInTenant,
} from "./assert-contact-role";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

describe("transactional Contact role validation", () => {
  it("locks and rereads the active Contact and CLIENT role using the supplied transaction", async (t) => {
    const previousContact = prisma.contact.findUnique;
    const previousRole = prisma.contactRole.findUnique;
    t.after(() => { prisma.contact.findUnique = previousContact; prisma.contactRole.findUnique = previousRole; });
    prisma.contact.findUnique = (() => { throw new Error("Unexpected global contact read"); }) as typeof previousContact;
    prisma.contactRole.findUnique = (() => { throw new Error("Unexpected global role read"); }) as typeof previousRole;
    const calls: string[] = [];
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray, contactId: string, tenantId: string) => {
        assert.match(parts.join("?"), /contacts.*FOR NO KEY UPDATE/);
        assert.equal(contactId, "client");
        assert.equal(tenantId, TENANT_A);
        calls.push("lock");
        return [];
      },
      contact: { findUnique: async () => { calls.push("contact"); return { tenantId: TENANT_A, status: "ACTIVE" }; } },
      contactRole: { findUnique: async () => { calls.push("role"); return { tenantId: TENANT_A, status: "INACTIVE" }; } },
    } as unknown as Prisma.TransactionClient;
    await assert.rejects(() => assertContactRoleInTenant("client", "CLIENT", TENANT_A, { tx }),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    assert.deepEqual(calls, ["lock", "contact", "role"]);
  });
});

describe("assertContactRoleMatchesTenant", () => {
  it("rejects contact from another tenant (wrong tenant)", () => {
    assert.throws(
      () =>
        assertContactRoleMatchesTenant({
          contact: { tenantId: TENANT_B, status: "ACTIVE" },
          role: { tenantId: TENANT_B, status: "ACTIVE" },
          ctxTenantId: TENANT_A,
          roleType: "SUPPLIER",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "NOT_FOUND",
    );
  });

  it("rejects missing contact", () => {
    assert.throws(
      () =>
        assertContactRoleMatchesTenant({
          contact: null,
          role: null,
          ctxTenantId: TENANT_A,
          roleType: "CLIENT",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "NOT_FOUND",
    );
  });

  it("rejects role belonging to another tenant", () => {
    assert.throws(
      () =>
        assertContactRoleMatchesTenant({
          contact: { tenantId: TENANT_A, status: "ACTIVE" },
          role: { tenantId: TENANT_B, status: "ACTIVE" },
          ctxTenantId: TENANT_A,
          roleType: "SUBCONTRACTOR",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("rejects inactive role", () => {
    assert.throws(
      () =>
        assertContactRoleMatchesTenant({
          contact: { tenantId: TENANT_A, status: "ACTIVE" },
          role: { tenantId: TENANT_A, status: "INACTIVE" },
          ctxTenantId: TENANT_A,
          roleType: "SUPPLIER",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("rejects inactive contact", () => {
    assert.throws(
      () =>
        assertContactRoleMatchesTenant({
          contact: { tenantId: TENANT_A, status: "INACTIVE" },
          role: { tenantId: TENANT_A, status: "ACTIVE" },
          ctxTenantId: TENANT_A,
          roleType: "CLIENT",
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("allows matching tenant + active role", () => {
    assert.doesNotThrow(() =>
      assertContactRoleMatchesTenant({
        contact: { tenantId: TENANT_A, status: "ACTIVE" },
        role: { tenantId: TENANT_A, status: "ACTIVE" },
        ctxTenantId: TENANT_A,
        roleType: "SUPPLIER",
      }),
    );
  });
});

describe("assertContactHasAnyMatchingRole", () => {
  it("allows an employee payee for direct AP", () => {
    assert.doesNotThrow(() =>
      assertContactHasAnyMatchingRole({
        contact: { tenantId: TENANT_A, status: "ACTIVE" },
        matchingRole: { tenantId: TENANT_A, status: "ACTIVE" },
        ctxTenantId: TENANT_A,
        allowedRoleTypes: ["SUPPLIER", "EMPLOYEE"],
      }),
    );
  });

  it("rejects when none of the allowed roles match", () => {
    assert.throws(
      () =>
        assertContactHasAnyMatchingRole({
          contact: { tenantId: TENANT_A, status: "ACTIVE" },
          matchingRole: null,
          ctxTenantId: TENANT_A,
          allowedRoleTypes: ["SUPPLIER", "EMPLOYEE"],
        }),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === "CONFLICT" &&
        err.message.includes("proveedor o empleado"),
    );
  });

  it("rejects an empty allowed-role list", () => {
    assert.throws(
      () =>
        assertContactHasAnyMatchingRole({
          contact: { tenantId: TENANT_A, status: "ACTIVE" },
          matchingRole: { tenantId: TENANT_A, status: "ACTIVE" },
          ctxTenantId: TENANT_A,
          allowedRoleTypes: [],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION",
    );
  });
});
