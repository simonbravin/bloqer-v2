import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { prisma, Prisma, type Contact, type ContactRole } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import {
  archiveContact, assignContactRole, createContact, getContactById, listAllContacts, listContacts,
  reactivateContact, removeContactRole, updateClientProfile, updateContact,
  updateSubcontractorProfile, updateSupplierProfile, type ContactWithRoles,
} from "./contact.service";

const tenantId = "00000000-0000-0000-0000-000000000001";
const contactId = "00000000-0000-0000-0000-000000000002";
const ctx: ServiceContext = { tenantId, companyId: null, actorUserId: "actor", roles: ["OWNER"] };
const timestamp = new Date("2026-01-01T00:00:00Z");

function contact(overrides: Partial<Contact> = {}): ContactWithRoles {
  return {
    id: contactId, tenantId, legalName: "Contacto sintético", fantasyName: null,
    taxId: null, taxIdType: null, ivaCondition: null, address: null, city: null,
    province: null, country: "AR", phone: null, email: null, notes: null,
    status: "ACTIVE", createdBy: "actor", updatedBy: "actor", createdAt: timestamp, updatedAt: timestamp,
    roles: [], clientProfile: null, supplierProfile: null, subcontractorProfile: null,
    ...overrides,
  };
}

function role(overrides: Partial<ContactRole> = {}): ContactRole {
  return {
    id: "role", contactId, tenantId, role: "CLIENT", status: "ACTIVE", notes: "Antes",
    createdAt: timestamp, updatedAt: timestamp, ...overrides,
  };
}

const originals = new WeakMap<TestContext, Map<object, Set<string>>>();
function stub(t: TestContext, target: object, key: string, replacement: unknown): void {
  const delegate = target as Record<string, unknown>;
  let objects = originals.get(t);
  if (!objects) { objects = new Map(); originals.set(t, objects); }
  let methods = objects.get(target);
  if (!methods) { methods = new Set(); objects.set(target, methods); }
  if (!methods.has(key)) {
    const original = delegate[key];
    t.after(() => { delegate[key] = original; });
    methods.add(key);
  }
  delegate[key] = replacement;
}

function prismaError(code: string, target?: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Synthetic conflict", {
    code, clientVersion: "test", ...(target ? { meta: { target } } : {}),
  });
}

function setup(t: TestContext) {
  const state = {
    contact: contact(), role: role() as ContactRole | null, transactions: 0,
    audit: [] as Array<Record<string, unknown>>, writes: [] as Array<{ model: string; args: Record<string, unknown> }>,
    sqlValues: [] as unknown[][], conflictTaxId: false, duplicateTaxId: false, stale: false, failAudit: false,
    profileExists: true,
    linkedProject: null as { id: string; code: string } | null,
    atContactLock: undefined as (() => void) | undefined,
  };
  const moduleQuery = t.mock.fn(async () => []);
  stub(t, prisma.tenantModuleSetting, "findMany", moduleQuery);
  stub(t, prisma.contact, "findUnique", async () => state.contact);
  stub(t, prisma.contactRole, "findUnique", async () => state.role);
  stub(t, prisma.project, "findFirst", async () => null);
  stub(t, prisma.auditLog, "create", async () => { throw new Error("Audit must use the transaction"); });
  stub(t, prisma, "$queryRaw", async (...args: unknown[]) => {
    state.sqlValues.push(args.slice(1));
    return [{ id: contactId }];
  });

  const profiles = {
    clientProfile: { id: "client-profile", contactId, creditLimit: new Prisma.Decimal("100.5"), paymentTermsDays: 0, defaultCurrency: "ARS", notes: "Antes", createdAt: timestamp, updatedAt: timestamp },
    supplierProfile: { id: "supplier-profile", contactId, paymentTermsDays: 0, defaultCurrency: "ARS", bankAccount: "Antes", notes: "Antes", createdAt: timestamp, updatedAt: timestamp },
    subcontractorProfile: { id: "subcontractor-profile", contactId, specialty: "Antes", notes: "Antes", createdAt: timestamp, updatedAt: timestamp },
  };
  const tx = {
    $queryRaw: async (...args: unknown[]) => {
      state.sqlValues.push(args.slice(1));
      if ((args[0] as TemplateStringsArray).join("?").includes("FOR NO KEY UPDATE")) state.atContactLock?.();
      return state.conflictTaxId ? [{ id: "existing" }] : [];
    },
    contact: {
      findUnique: async () => state.contact,
      findUniqueOrThrow: async () => state.contact,
      create: async (args: { data: Partial<Contact> }) => {
        if (state.duplicateTaxId) throw prismaError("P2002", ["tenantId", "taxId"]);
        state.writes.push({ model: "contact", args });
        return contact(args.data);
      },
      update: async (args: { where: Record<string, unknown>; data: Partial<Contact> }) => {
        if (state.stale) throw prismaError("P2025");
        state.writes.push({ model: "contact", args });
        return contact({ ...state.contact, ...args.data });
      },
    },
    contactRole: {
      findUnique: async () => state.role,
      create: async (args: { data: Partial<ContactRole> }) => {
        state.writes.push({ model: "contactRole", args });
        return role(args.data);
      },
      update: async (args: { where: Record<string, unknown>; data: Partial<ContactRole> }) => {
        if (state.stale) throw prismaError("P2025");
        state.writes.push({ model: "contactRole", args });
        return role({ ...state.role, ...args.data });
      },
    },
    project: { findFirst: async () => state.linkedProject },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
      if (state.failAudit) throw new Error("audit unavailable");
      state.audit.push(data);
      return { id: "audit", ...data };
    } },
  } as Record<string, unknown>;
  for (const [model, profile] of Object.entries(profiles)) {
    tx[model] = {
      findUnique: async () => state.profileExists ? profile : null,
      upsert: async (args: Record<string, unknown>) => {
        state.writes.push({ model, args });
        return profile;
      },
      update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (state.stale) throw prismaError("P2025");
        state.writes.push({ model, args });
        return { ...profile, ...args.data };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        state.writes.push({ model, args });
        return { ...profile, ...args.data };
      },
    };
  }
  stub(t, prisma, "$transaction", async (operation: (transaction: unknown) => Promise<unknown>) => {
    state.transactions += 1;
    return operation(tx);
  });
  return { state, moduleQuery };
}

const errorCode = (code: ServiceError["code"]) =>
  (error: unknown) => error instanceof ServiceError && error.code === code;

const mutations = [
  ["create", (context: ServiceContext) => createContact({ legalName: "Synthetic", initialRole: "OTHER" }, context)],
  ["edit", (context: ServiceContext) => updateContact(contactId, { email: "new@example.invalid" }, context)],
  ["archive", (context: ServiceContext) => archiveContact(contactId, context)],
  ["reactivate", (context: ServiceContext) => reactivateContact(contactId, context)],
  ["assign role", (context: ServiceContext) => assignContactRole(contactId, { role: "OTHER" }, context)],
  ["remove role", (context: ServiceContext) => removeContactRole(contactId, "CLIENT", context)],
  ["client profile", (context: ServiceContext) => updateClientProfile(contactId, { creditLimit: "10.005", notes: null }, context)],
  ["supplier profile", (context: ServiceContext) => updateSupplierProfile(contactId, { bankAccount: null }, context)],
  ["subcontractor profile", (context: ServiceContext) => updateSubcontractorProfile(contactId, { specialty: null }, context)],
] as const;

describe("AG-03 directory services without database access", { concurrency: false }, () => {
  for (const [name, invoke] of [
    ["detail", (context: ServiceContext) => getContactById(contactId, context)],
    ["list", (context: ServiceContext) => listContacts({}, context)],
    ["all contacts", (context: ServiceContext) => listAllContacts({}, context)],
    ...mutations,
  ] as const) {
    it(`${name} rejects a disabled DIRECTORY module before contact access`, async (t) => {
      const { state } = setup(t);
      stub(t, prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "DIRECTORY", isEnabled: false }]);
      const read = t.mock.fn(async () => { throw new Error("unexpected contact read"); });
      stub(t, prisma.contact, "findUnique", read);
      await assert.rejects(() => invoke(ctx), errorCode("FORBIDDEN"));
      assert.equal(read.mock.callCount(), 0);
      assert.equal(state.transactions, 0);
    });
  }

  for (const [name, invoke] of mutations) {
    it(`${name} preserves the current read-only permission guard`, async (t) => {
      const { state, moduleQuery } = setup(t);
      await assert.rejects(() => invoke({ ...ctx, roles: ["VIEWER"] }), errorCode("FORBIDDEN"));
      assert.equal(moduleQuery.mock.callCount(), 0);
      assert.equal(state.transactions, 0);
    });

    it(`${name} awaits its audit event in the same transaction`, async (t) => {
      const { state } = setup(t);
      if (name === "reactivate") state.contact.status = "ARCHIVED";
      if (name === "assign role") state.role = null;
      await invoke(ctx);
      assert.equal(state.transactions, 1);
      assert.equal(state.audit.length, 1);
      assert.equal(state.audit[0]?.tenantId, tenantId);
      assert.ok(state.writes.length > 0);
    });

    it(`${name} propagates a failed audit instead of returning success`, async (t) => {
      const { state } = setup(t);
      if (name === "reactivate") state.contact.status = "ARCHIVED";
      if (name === "assign role") state.role = null;
      state.failAudit = true;
      await assert.rejects(() => invoke(ctx), /audit unavailable/);
      assert.equal(state.audit.length, 0);
    });
  }

  for (const [name, invoke] of mutations.filter(([name]) => name !== "create" && name !== "reactivate")) {
    it(`${name} rejects a foreign contact before any write`, async (t) => {
      const { state } = setup(t);
      state.contact.tenantId = "foreign-tenant";
      await assert.rejects(() => invoke(ctx), errorCode("FORBIDDEN"));
      assert.equal(state.writes.length, 0);
    });
  }

  for (const [name, invoke] of mutations.filter(([name]) => name.endsWith("profile"))) {
    it(`${name} requires an active role even when the profile already exists`, async (t) => {
      const { state } = setup(t);
      state.role = role({ status: "INACTIVE" });
      await assert.rejects(() => invoke(ctx), errorCode("NOT_FOUND"));
      assert.equal(state.writes.length, 0);
    });
    it(`${name} returns a recoverable conflict for a concurrent profile edit`, async (t) => {
      const { state } = setup(t);
      state.stale = true;
      await assert.rejects(() => invoke(ctx), errorCode("CONFLICT"));
      assert.equal(state.audit.length, 0);
    });
  }

  for (const [name, invoke] of mutations.filter(([name]) => ["edit", "archive", "reactivate", "assign role", "remove role"].includes(name))) {
    it(`${name} rejects a concurrent change instead of reporting a completed mutation`, async (t) => {
      const { state } = setup(t);
      if (name === "reactivate") state.contact.status = "ARCHIVED";
      if (name === "assign role") state.role = role({ role: "OTHER", status: "INACTIVE" });
      state.stale = true;
      await assert.rejects(() => invoke(ctx), errorCode("CONFLICT"));
      assert.equal(state.audit.length, 0);
    });
  }

  it("does not deactivate a role whose tenant disagrees with its parent", async (t) => {
    const { state } = setup(t);
    state.role = role({ tenantId: "foreign-tenant" });
    await assert.rejects(() => removeContactRole(contactId, "CLIENT", ctx), errorCode("FORBIDDEN"));
    assert.equal(state.writes.length, 0);
  });

  it("does not remove CLIENT if a project was linked after its initial check", async (t) => {
    const { state } = setup(t);
    state.atContactLock = () => { state.linkedProject = { id: "new-project", code: "CONCURRENT" }; };
    await assert.rejects(() => removeContactRole(contactId, "CLIENT", ctx), errorCode("CONFLICT"));
    assert.equal(state.writes.length, 0);
  });

  it("does not assign a role if the contact was archived after its initial check", async (t) => {
    const { state } = setup(t);
    state.role = null;
    state.atContactLock = () => { state.contact.status = "ARCHIVED"; };
    await assert.rejects(() => assignContactRole(contactId, { role: "OTHER" }, ctx), errorCode("CONFLICT"));
    assert.equal(state.writes.length, 0);
  });

  for (const [name, invoke] of mutations.filter(([name]) => name.endsWith("profile"))) {
    it(`${name} rechecks a concurrent role removal after obtaining the Contact lock`, async (t) => {
      const { state } = setup(t);
      state.atContactLock = () => { state.role = role({ status: "INACTIVE" }); };
      await assert.rejects(() => invoke(ctx), errorCode("NOT_FOUND"));
      assert.equal(state.writes.length, 0);
    });
  }

  it("preserves an existing profile when its role is reactivated and clears explicit role notes", async (t) => {
    const { state } = setup(t);
    state.role = role({ status: "INACTIVE" });
    const result = await assignContactRole(contactId, { role: "CLIENT", notes: null, creditLimit: "999" }, ctx);
    assert.equal(result.notes, null);
    assert.deepEqual(state.writes.find((write) => write.model === "clientProfile")?.args.update, {});
  });

  it("validates and normalizes fiscal data for service callers as well as server actions", async (t) => {
    const { state } = setup(t);
    await createContact({ legalName: "Synthetic", initialRole: "OTHER", taxIdType: "CUIT", taxId: "30-70867343-5" }, ctx);
    const data = state.writes[0]?.args.data as Record<string, unknown>;
    assert.equal(data.taxId, "30708673435");
    assert.ok(state.sqlValues[0]?.includes(tenantId));
    assert.ok(state.sqlValues[0]?.includes("30708673435"));
    await assert.rejects(() => createContact({ legalName: "Synthetic", initialRole: "OTHER", taxIdType: "CUIL", taxId: "123" }, ctx), errorCode("VALIDATION"));
  });

  it("preserves explicitly foreign fiscal identifiers literally", async (t) => {
    const { state } = setup(t);
    await createContact({ legalName: "Synthetic", initialRole: "OTHER", taxIdType: "FOREIGN", taxId: "30-70867343-5" }, ctx);
    assert.equal((state.writes[0]?.args.data as Record<string, unknown>).taxId, "30-70867343-5");
  });

  it("validates a partial fiscal type edit against the persisted identifier", async (t) => {
    const { state } = setup(t);
    state.contact.taxId = "30.70867343/5";
    await updateContact(contactId, { taxIdType: "CUIT" }, ctx);
    const data = state.writes[0]?.args.data as Record<string, unknown>;
    assert.equal(data.taxId, "30708673435");
    assert.ok(state.sqlValues[0]?.includes(contactId));
  });

  it("rejects a normalized legacy tax duplicate without attempting a write", async (t) => {
    const { state } = setup(t);
    state.conflictTaxId = true;
    await assert.rejects(() => createContact({ legalName: "Synthetic", initialRole: "OTHER", taxIdType: "CUIT", taxId: "30708673435" }, ctx), errorCode("CONFLICT"));
    assert.equal(state.writes.length, 0);
  });

  it("translates a simultaneous canonical fiscal duplicate into CONFLICT", async (t) => {
    const { state } = setup(t);
    state.duplicateTaxId = true;
    await assert.rejects(() => createContact({ legalName: "Synthetic", initialRole: "OTHER", taxIdType: "CUIT", taxId: "30708673435" }, ctx), errorCode("CONFLICT"));
    assert.equal(state.audit.length, 0);
  });

  it("records general contact fields that used to be absent from audit snapshots", async (t) => {
    const { state } = setup(t);
    await updateContact(contactId, { email: "new@example.invalid", taxIdType: "FOREIGN", ivaCondition: "FOREIGN" }, ctx);
    const before = state.audit[0]?.before as Record<string, unknown>;
    const after = state.audit[0]?.after as Record<string, unknown>;
    assert.equal(before.email, null);
    assert.equal(after.email, "new@example.invalid");
    assert.equal(after.taxIdType, "FOREIGN");
    assert.equal(after.ivaCondition, "FOREIGN");
  });

  it("rounds credit limits to money precision, clears notes, and audits a monetary string", async (t) => {
    const { state } = setup(t);
    const updated = await updateClientProfile(contactId, { creditLimit: "10.005", notes: null }, ctx);
    assert.equal(String(updated.creditLimit), "10.01");
    assert.equal(updated.notes, null);
    assert.equal((state.audit[0]?.before as Record<string, unknown>).creditLimit, "100.50");
  });

  it("does not silently truncate selectors after 10,000 contacts and checks the gate once", async (t) => {
    const { moduleQuery } = setup(t);
    const rows = Array.from({ length: 10_001 }, (_, index) => contact({ id: String(index) }));
    stub(t, prisma.contact, "findMany", async (args: { skip: number; take: number; orderBy: unknown; where: { tenantId: string } }) => {
      assert.deepEqual(args.orderBy, [{ legalName: "asc" }, { id: "asc" }]);
      assert.equal(args.where.tenantId, tenantId);
      return rows.slice(args.skip, args.skip + args.take);
    });
    stub(t, prisma.contact, "count", async () => rows.length);
    assert.equal((await listAllContacts({ status: "ACTIVE" }, ctx)).length, rows.length);
    assert.equal(moduleQuery.mock.callCount(), 1);
  });

  it("rejects malformed pagination before querying contact rows", async (t) => {
    setup(t);
    const query = t.mock.fn(async () => []);
    stub(t, prisma.contact, "findMany", query);
    for (const page of [NaN, Infinity, 0, 1.5, Number.MAX_SAFE_INTEGER]) {
      await assert.rejects(() => listContacts({ page }, ctx), errorCode("VALIDATION"));
    }
    assert.equal(query.mock.callCount(), 0);
  });

  it("includes normalized fiscal matches without dropping the tenant predicate", async (t) => {
    const { state } = setup(t);
    stub(t, prisma.contact, "findMany", async (args: { where: Prisma.ContactWhereInput }) => {
      assert.equal(args.where.tenantId, tenantId);
      assert.ok(args.where.OR?.some((part) => (part.id as { in?: string[] } | undefined)?.in?.includes(contactId)));
      return [];
    });
    stub(t, prisma.contact, "count", async () => 0);
    await listContacts({ search: "30-70867343-5" }, ctx);
    assert.deepEqual(state.sqlValues[0], [tenantId, "30708673435"]);
  });
});
