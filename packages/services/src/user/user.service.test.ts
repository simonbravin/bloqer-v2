import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { prisma, type Prisma } from "@bloqer/database";
import {
  getUserByEmail, getUserById, syncUserFromOAuth, updateMyUserProfile, updateUserStatus,
} from "./user.service";
import { ServiceError, type ServiceContext } from "../types";

const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("user service public contracts and audited changes", { concurrency: false }, () => {
  const ctx: ServiceContext = {
    actorUserId: "actor", tenantId: "tenant", companyId: null, roles: ["OWNER"],
  };
  let user: Record<string, unknown>;
  let membershipActive: boolean;
  let tenantActive: boolean;
  let otherMemberships: number;
  let backupOwner: boolean;
  let auditFailure: boolean;
  let writes: number;
  let audits: number;
  let transactionActive: boolean;
  let teamModuleEnabled: boolean;

  function project(select: Prisma.UserSelect | null | undefined) {
    return select
      ? Object.fromEntries(Object.keys(select).filter((key) => select[key as keyof typeof select]).map((key) => [key, user[key]]))
      : { ...user };
  }

  beforeEach(() => {
    user = {
      id: "actor", email: "person@example.test", name: "Previous", image: null, status: "ACTIVE",
      passwordHash: "private-hash", passwordUpdatedAt: new Date(), emailVerified: new Date(),
    };
    membershipActive = true;
    tenantActive = true;
    otherMemberships = 0;
    backupOwner = false;
    auditFailure = false;
    writes = 0;
    audits = 0;
    transactionActive = false;
    teamModuleEnabled = true;
    stub(prisma.tenantModuleSetting, "findMany", async () => [{
      moduleKey: "USERS_PERMISSIONS", isEnabled: teamModuleEnabled,
    }]);
    stub(prisma, "$queryRaw", async () => [{ id: ctx.tenantId }]);
    stub(prisma, "$transaction", async (run: (tx: typeof prisma) => Promise<unknown>) => {
      const snapshot = { ...user };
      transactionActive = true;
      try { return await run(prisma); }
      catch (error) { user = snapshot; throw error; }
      finally { transactionActive = false; }
    });
    stub(prisma.user, "findUnique", async (args: Prisma.UserFindUniqueArgs) => project(args.select));
    stub(prisma.user, "upsert", async (args: Prisma.UserUpsertArgs) => project(args.select));
    stub(prisma.user, "update", async (args: Prisma.UserUpdateArgs) => {
      assert.equal(transactionActive, true, "Profile/status changes must run inside their audit transaction");
      Object.assign(user, args.data);
      writes++;
      return project(args.select);
    });
    stub(prisma.userMembership, "findFirst", async (args: Prisma.UserMembershipFindFirstArgs) => {
      if (args.where?.status === "ACTIVE" && !membershipActive) return null;
      if (args.where?.user && user.status !== "ACTIVE") return null;
      if (args.where?.tenant && !tenantActive) return null;
      return { id: "membership", userId: "actor", status: membershipActive ? "ACTIVE" : "INACTIVE", roles: ["OWNER"] };
    });
    stub(prisma.userMembership, "count", async () => otherMemberships);
    stub(prisma.userMembership, "findMany", async () => [
      { id: "membership", roles: ["OWNER"] },
      ...(backupOwner ? [{ id: "backup-owner", roles: ["OWNER"] }] : []),
    ]);
    stub(prisma.auditLog, "create", async () => {
      assert.equal(transactionActive, true, "Audit must share the user mutation transaction");
      if (auditFailure) throw new Error("Audit unavailable");
      audits++;
      return { id: "audit" };
    });
  });

  afterEach(() => { restore.splice(0).reverse().forEach((reset) => reset()); });

  it("returns public fields from profile lookup, email lookup and OAuth sync", async () => {
    for (const result of [
      await getUserById("actor"), await getUserByEmail("person@example.test"),
      await syncUserFromOAuth({ email: "person@example.test" }),
    ]) {
      assert.deepEqual(Object.keys(result!).sort(), ["email", "id", "image", "name", "status"]);
      assert.equal("passwordHash" in result!, false);
      assert.equal("passwordUpdatedAt" in result!, false);
    }
  });

  it("updates the profile with public output and an atomic audit", async () => {
    const result = await updateMyUserProfile({ name: "Updated" }, ctx);
    assert.equal(result.name, "Updated");
    assert.equal("passwordHash" in result, false);
    assert.equal(writes, 1);
    assert.equal(audits, 1);
  });

  for (const scenario of ["inactive membership", "suspended account", "suspended tenant"]) {
    it(`rejects profile changes with ${scenario}`, async () => {
      if (scenario === "inactive membership") membershipActive = false;
      if (scenario === "suspended account") user.status = "SUSPENDED";
      if (scenario === "suspended tenant") tenantActive = false;
      await assert.rejects(() => updateMyUserProfile({ name: "Updated" }, ctx),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
      assert.equal(writes, 0);
      assert.equal(audits, 0);
    });
  }

  it("rolls the profile back when its audit cannot be recorded", async () => {
    auditFailure = true;
    await assert.rejects(() => updateMyUserProfile({ name: "Updated" }, ctx), /Audit unavailable/);
    assert.equal(user.name, "Previous");
    assert.equal(audits, 0);
  });

  it("keeps personal profile editing available when team administration is disabled", async () => {
    teamModuleEnabled = false;
    assert.equal((await updateMyUserProfile({ name: "Updated" }, ctx)).name, "Updated");
    assert.equal(audits, 1);
  });

  it("blocks the global status API when team administration is disabled", async () => {
    teamModuleEnabled = false;
    await assert.rejects(() => updateUserStatus("actor", "SUSPENDED", ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    assert.equal(writes, 0);
    assert.equal(audits, 0);
  });

  it("does not allow global suspension of the last active owner", async () => {
    await assert.rejects(() => updateUserStatus("actor", "SUSPENDED", ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    assert.equal(user.status, "ACTIVE");
    assert.equal(writes, 0);
  });

  it("does not allow a tenant admin to disable a user belonging to another tenant", async () => {
    otherMemberships = 1;
    await assert.rejects(() => updateUserStatus("actor", "SUSPENDED", ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    assert.equal(writes, 0);
  });

  it("requires user-management permission for the internal global status API", async () => {
    await assert.rejects(() => updateUserStatus("actor", "SUSPENDED", { ...ctx, roles: ["VIEWER"] }),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    assert.equal(writes, 0);
  });

  it("audits an allowed global status change without returning private account data", async () => {
    backupOwner = true;
    const result = await updateUserStatus("actor", "SUSPENDED", ctx);
    assert.equal(result.status, "SUSPENDED");
    assert.equal("passwordHash" in result, false);
    assert.equal(audits, 1);
  });

  it("rolls the global status back when its audit cannot be recorded", async () => {
    backupOwner = true;
    auditFailure = true;
    await assert.rejects(() => updateUserStatus("actor", "SUSPENDED", ctx), /Audit unavailable/);
    assert.equal(user.status, "ACTIVE");
    assert.equal(audits, 0);
  });
});
