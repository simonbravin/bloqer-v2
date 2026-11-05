import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "@bloqer/database";
import type { MembershipStatus, UserRole, UserStatus } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import { updateTenantMemberRoles, updateTenantMemberStatus } from "./team-management.service";

const TENANT = "11111111-1111-4111-8111-111111111111";
const FOREIGN_TENANT = "22222222-2222-4222-8222-222222222222";
const FIRST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ctx: ServiceContext = {
  tenantId: TENANT,
  actorUserId: "operator",
  companyId: null,
  roles: ["ADMIN"],
};

type Member = {
  id: string;
  tenantId: string;
  companyId: string | null;
  userId: string;
  roles: UserRole[];
  status: MembershipStatus;
  userStatus?: UserStatus;
};
type State = { members: Member[]; audit: Record<string, unknown>[] };

function owner(id: string): Member {
  return { id, tenantId: TENANT, companyId: null, userId: `user-${id}`, roles: ["OWNER"], status: "ACTIVE" };
}

/** In-memory transactions model a shared tenant row lock; no database is accessed. */
async function withMemberships(
  initial: Member[],
  run: (state: () => State, failAudit: () => void) => Promise<void>,
  modules: { moduleKey: string; isEnabled: boolean }[] = [],
): Promise<void> {
  let committed: State = { members: structuredClone(initial), audit: [] };
  let rejectAudit = false;
  let lockTail = Promise.resolve();
  function delegates(state: () => State) {
    return {
      userMembership: {
        findFirst: async ({ where }: { where: { id: string; tenantId: string; OR?: { companyId: string | null }[] } }) =>
          structuredClone(state().members.find((m) => m.id === where.id && m.tenantId === where.tenantId &&
            (!where.OR || where.OR.some(({ companyId }) => m.companyId === companyId))) ?? null),
        findMany: async ({ where }: { where: { tenantId: string; status: MembershipStatus; user?: { status: UserStatus } } }) =>
          structuredClone(state().members.filter((m) => m.tenantId === where.tenantId && m.status === where.status &&
            (!where.user || (m.userStatus ?? "ACTIVE") === where.user.status))),
        update: async ({ where, data }: { where: { id: string }; data: Partial<Member> }) => {
          const row = state().members.find((m) => m.id === where.id);
          assert.ok(row);
          Object.assign(row, data);
          return row;
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (rejectAudit) throw new Error("audit unavailable");
          state().audit.push(data);
          return data;
        },
      },
    };
  }
  const originals = {
    transaction: prisma.$transaction,
    first: prisma.userMembership.findFirst,
    many: prisma.userMembership.findMany,
    update: prisma.userMembership.update,
    audit: prisma.auditLog.create,
    modules: prisma.tenantModuleSetting.findMany,
  };
  const direct = delegates(() => committed);
  prisma.userMembership.findFirst = direct.userMembership.findFirst as unknown as typeof originals.first;
  prisma.userMembership.findMany = direct.userMembership.findMany as unknown as typeof originals.many;
  prisma.userMembership.update = direct.userMembership.update as unknown as typeof originals.update;
  prisma.auditLog.create = direct.auditLog.create as unknown as typeof originals.audit;
  prisma.tenantModuleSetting.findMany = (async () => modules) as unknown as typeof originals.modules;
  prisma.$transaction = (async (callback: (tx: unknown) => Promise<unknown>) => {
    let staged: State | undefined;
    let release: (() => void) | undefined;
    const tx = {
      ...delegates(() => staged ?? committed),
      $queryRaw: async (_sql: TemplateStringsArray, tenantId: string) => {
        assert.equal(tenantId, TENANT);
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        staged = structuredClone(committed);
        return [{ id: tenantId }];
      },
    };
    try {
      const result = await callback(tx);
      if (staged) committed = staged;
      return result;
    } finally {
      release?.();
    }
  }) as unknown as typeof originals.transaction;
  try {
    await run(() => committed, () => { rejectAudit = true; });
  } finally {
    prisma.$transaction = originals.transaction;
    prisma.userMembership.findFirst = originals.first;
    prisma.userMembership.findMany = originals.many;
    prisma.userMembership.update = originals.update;
    prisma.auditLog.create = originals.audit;
    prisma.tenantModuleSetting.findMany = originals.modules;
  }
}

const demote = (id: string, context = ctx) => updateTenantMemberRoles(id, ["VIEWER"], context);
const deactivate = (id: string, context = ctx) => updateTenantMemberStatus(id, "INACTIVE", context);

for (const [label, firstMutation, secondMutation] of [
  ["two role changes", demote, demote],
  ["two deactivations", deactivate, deactivate],
  ["role change and deactivation", demote, deactivate],
] as const) {
  test(`concurrent ${label} preserve an active OWNER`, async () => {
    await withMemberships([owner(FIRST), owner(SECOND)], async (state) => {
      const results = await Promise.allSettled([firstMutation(FIRST), secondMutation(SECOND)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejection = results.find((r) => r.status === "rejected");
      assert.ok(rejection?.status === "rejected");
      assert.ok(rejection.reason instanceof ServiceError && rejection.reason.code === "CONFLICT");
      assert.equal(state().members.filter((m) => m.status === "ACTIVE" && m.roles.includes("OWNER")).length, 1);
      assert.equal(state().audit.length, 1);
    });
  });
}

for (const [label, mutate] of [["roles", demote], ["status", deactivate]] as const) {
  test(`${label}: audit failure rolls back the membership mutation`, async () => {
    const original = [owner(FIRST), owner(SECOND)];
    await withMemberships(original, async (state, failAudit) => {
      failAudit();
      await assert.rejects(() => mutate(FIRST), /audit unavailable/);
      assert.deepEqual(state(), { members: original, audit: [] });
    });
  });

  test(`${label}: cannot remove the only active OWNER`, async () => {
    const original = [owner(FIRST), { ...owner(SECOND), status: "INACTIVE" as const }];
    await withMemberships(original, async (state) => {
      await assert.rejects(() => mutate(FIRST), (e: unknown) =>
        e instanceof ServiceError && e.code === "CONFLICT");
      assert.deepEqual(state(), { members: original, audit: [] });
    });
  });

  test(`${label}: a suspended account cannot stand in for the last eligible OWNER`, async () => {
    const original = [owner(FIRST), { ...owner(SECOND), userStatus: "SUSPENDED" as const }];
    await withMemberships(original, async (state) => {
      await assert.rejects(() => mutate(FIRST), (e: unknown) =>
        e instanceof ServiceError && e.code === "CONFLICT");
      assert.deepEqual(state(), { members: original, audit: [] });
    });
  });

  test(`${label}: deny unauthorized and foreign-tenant mutations`, async () => {
    const original = [owner(FIRST), { ...owner(SECOND), tenantId: FOREIGN_TENANT }];
    await withMemberships(original, async (state) => {
      await assert.rejects(() => mutate(FIRST, { ...ctx, roles: ["VIEWER"] }), (e: unknown) =>
        e instanceof ServiceError && e.code === "FORBIDDEN");
      await assert.rejects(() => mutate(SECOND), (e: unknown) =>
        e instanceof ServiceError && e.code === "NOT_FOUND");
      assert.deepEqual(state(), { members: original, audit: [] });
    });
  });

  test(`${label}: deny membership changes in a sibling company`, async () => {
    const original = [owner(FIRST), { ...owner(SECOND), companyId: "other-company" }];
    await withMemberships(original, async (state) => {
      await assert.rejects(() => mutate(SECOND, { ...ctx, companyId: "active-company" }), (e: unknown) =>
        e instanceof ServiceError && e.code === "NOT_FOUND");
      assert.deepEqual(state(), { members: original, audit: [] });
    });
  });
}

test("role changes deduplicate roles and audit their before/after values", async () => {
  await withMemberships([owner(FIRST), owner(SECOND)], async (state) => {
    await updateTenantMemberRoles(FIRST, ["ADMIN", "ADMIN", "VIEWER"], ctx);
    assert.deepEqual(state().members[0]?.roles, ["ADMIN", "VIEWER"]);
    assert.deepEqual(state().audit[0]?.before, { userId: `user-${FIRST}`, roles: "OWNER" });
    assert.deepEqual(state().audit[0]?.after, { userId: `user-${FIRST}`, roles: "ADMIN,VIEWER", companyId: null });
  });
});

test("reactivation keeps the existing roles and records the status change", async () => {
  await withMemberships([owner(FIRST), { ...owner(SECOND), status: "INACTIVE" }], async (state) => {
    await updateTenantMemberStatus(SECOND, "ACTIVE", ctx);
    assert.equal(state().members[1]?.status, "ACTIVE");
    assert.deepEqual(state().members[1]?.roles, ["OWNER"]);
    assert.deepEqual(state().audit[0]?.before, { userId: `user-${SECOND}`, status: "INACTIVE" });
    assert.deepEqual(state().audit[0]?.after, { userId: `user-${SECOND}`, status: "ACTIVE", companyId: null });
  });
});

test("disabled team module blocks mutations even for ADMIN", async () => {
  const original = [owner(FIRST), owner(SECOND)];
  await withMemberships(original, async (state) => {
    for (const mutate of [demote, deactivate]) {
      await assert.rejects(() => mutate(FIRST), (e: unknown) =>
        e instanceof ServiceError && e.code === "FORBIDDEN");
    }
    assert.deepEqual(state(), { members: original, audit: [] });
  }, [{ moduleKey: "USERS_PERMISSIONS", isEnabled: false }]);
});
