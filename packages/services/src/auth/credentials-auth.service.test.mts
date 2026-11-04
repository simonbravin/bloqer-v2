import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";
import { compare } from "bcryptjs";
import type { Prisma, UserStatus } from "@bloqer/database";

const require = createRequire(import.meta.url);
const { prisma } = require("@bloqer/database") as typeof import("@bloqer/database");
const {
  requestPasswordReset,
  resetPasswordWithToken,
  takeoverUnverifiedCredentialsStub,
  verifyEmailWithToken,
} = require("./credentials-auth.service") as typeof import("./credentials-auth.service");
const { AUTH_TOKEN_PURPOSE, authTokenIdentifier, hashAuthToken } =
  require("./credentials-token") as typeof import("./credentials-token");

type TestUser = {
  id: string;
  email: string;
  emailVerified: Date | null;
  status: UserStatus;
  passwordHash: string | null;
  passwordUpdatedAt: Date | null;
  accounts: Array<{ provider: string }>;
};
type TestToken = { identifier: string; token: string; expires: Date };
const email = "person@example.com";
const rawToken = "a".repeat(43);
const password = "newPassword123";
const restore: Array<() => void> = [];

function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("credentials service token and account lifecycle", { concurrency: false }, () => {
  let user: TestUser;
  let tokens: TestToken[];
  let mutateAfterRead: (() => void) | null;
  let failUserUpdate: boolean;
  let userWrites: number;
  let tokenCreates: number;
  let lockAcquisitions: number;
  let lockTail: Promise<void>;

  function tokenMatches(row: TestToken, where: Prisma.VerificationTokenWhereInput): boolean {
    if (typeof where.identifier === "string" && row.identifier !== where.identifier) return false;
    if (typeof where.identifier === "object") {
      if (typeof where.identifier.startsWith === "string" && !row.identifier.startsWith(where.identifier.startsWith)) return false;
      if (Array.isArray(where.identifier.in) && !where.identifier.in.includes(row.identifier)) return false;
    }
    if (typeof where.token === "string" && row.token !== where.token) return false;
    if (where.expires && typeof where.expires === "object" && !(where.expires instanceof Date)) {
      const expires = where.expires.gt;
      if ((typeof expires === "string" || expires instanceof Date) && row.expires <= new Date(expires)) return false;
    }
    return true;
  }

  beforeEach(() => {
    user = {
      id: "user", email, status: "INVITED", emailVerified: null,
      passwordHash: "previous-hash", passwordUpdatedAt: null, accounts: [],
    };
    tokens = [];
    mutateAfterRead = null;
    failUserUpdate = false;
    userWrites = 0;
    tokenCreates = 0;
    lockAcquisitions = 0;
    lockTail = Promise.resolve();

    // No test can send email, even if the invoking environment is configured.
    const previousEmailKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "";
    restore.push(() => {
      if (previousEmailKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousEmailKey;
    });

    const readUser = async () => {
      const snapshot = { ...user, accounts: [...user.accounts] };
      mutateAfterRead?.();
      mutateAfterRead = null;
      return snapshot;
    };
    stub(prisma.user, "findUnique", readUser);
    stub(prisma.user, "findFirst", readUser);
    stub(prisma.user, "update", async () => { throw new Error("Unguarded account write"); });
    stub(prisma.user, "updateMany", async (args: Prisma.UserUpdateManyArgs) => {
      if (failUserUpdate) throw new Error("User write failed");
      const where = args.where ?? {};
      const statusFilter = where.status;
      if (typeof statusFilter === "string" && statusFilter !== user.status) return { count: 0 };
      if (typeof statusFilter === "object" && Array.isArray(statusFilter.in) && !statusFilter.in.includes(user.status)) {
        return { count: 0 };
      }
      if ("emailVerified" in where && where.emailVerified === null && user.emailVerified !== null) {
        return { count: 0 };
      }
      if (where.accounts?.none && user.accounts.some((account) => account.provider !== "credentials")) {
        return { count: 0 };
      }
      Object.assign(user, args.data);
      userWrites++;
      return { count: 1 };
    });
    stub(prisma.verificationToken, "findFirst", async (args: Prisma.VerificationTokenFindFirstArgs) => {
      return tokens.find((row) => tokenMatches(row, args.where ?? {})) ?? null;
    });
    stub(prisma.verificationToken, "deleteMany", async (args: Prisma.VerificationTokenDeleteManyArgs) => {
      const before = tokens.length;
      tokens = tokens.filter((row) => !tokenMatches(row, args.where ?? {}));
      return { count: before - tokens.length };
    });
    stub(prisma.verificationToken, "create", async (args: Prisma.VerificationTokenCreateArgs) => {
      const row = args.data as TestToken;
      tokens.push(row);
      tokenCreates++;
      return row;
    });
    stub(prisma, "$transaction", async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const originalUser = structuredClone(user);
      const originalTokens = structuredClone(tokens);
      let release: (() => void) | undefined;
      const tx = {
        user: prisma.user,
        verificationToken: prisma.verificationToken,
        $executeRaw: async (query: Prisma.Sql) => {
          assert.match(query.sql, /pg_advisory_xact_lock/);
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => { release = resolve; });
          await previous;
          lockAcquisitions++;
          return 1;
        },
      } as unknown as Prisma.TransactionClient;
      try {
        return await run(tx);
      } catch (error) {
        user = originalUser;
        tokens = originalTokens;
        throw error;
      } finally {
        release?.();
      }
    });
  });

  afterEach(() => { restore.splice(0).reverse().forEach((reset) => reset()); });

  function addToken(purpose: "email-verify" | "password-reset", raw = rawToken, expires?: Date) {
    tokens.push({
      identifier: authTokenIdentifier(purpose, email), token: hashAuthToken(raw),
      expires: expires ?? new Date(Date.now() + 60_000),
    });
  }

  it("verifies once and activates an invited account", async () => {
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    assert.deepEqual(await verifyEmailWithToken({ token: rawToken }), { ok: true });
    assert.equal(user.status, "ACTIVE");
    assert.ok(user.emailVerified);
    assert.equal(tokens.length, 0);
    assert.equal((await verifyEmailWithToken({ token: rawToken })).ok, false);
    assert.equal(userWrites, 1);
  });

  it("rejects expired tokens and tokens from another purpose", async () => {
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, rawToken, new Date(Date.now() - 1));
    assert.equal((await verifyEmailWithToken({ token: rawToken })).ok, false);
    tokens = [];
    addToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET);
    assert.equal((await verifyEmailWithToken({ token: rawToken })).ok, false);
    assert.equal(userWrites, 0);
  });

  for (const status of ["SUSPENDED", "INACTIVE"] as const) {
    it(`verification preserves an existing ${status} account`, async () => {
      addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
      user.status = status;
      assert.equal((await verifyEmailWithToken({ token: rawToken })).ok, false);
      assert.equal(user.status, status);
      assert.equal(userWrites, 0);
    });
  }

  it("does not reactivate an account suspended after the verification read", async () => {
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    mutateAfterRead = () => { user.status = "SUSPENDED"; };
    assert.equal((await verifyEmailWithToken({ token: rawToken })).ok, false);
    assert.equal(user.status, "SUSPENDED");
    assert.equal(userWrites, 0);
    assert.equal(tokens.length, 0);
  });

  it("rolls token consumption back if verification cannot update the user", async () => {
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    failUserUpdate = true;
    await assert.rejects(() => verifyEmailWithToken({ token: rawToken }), /User write failed/);
    assert.equal(tokens.length, 1);
    assert.equal(user.status, "INVITED");
  });

  it("resets the password once, revokes prior links and records the revocation epoch", async () => {
    addToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET);
    addToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, "b".repeat(43));
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, "c".repeat(43));
    assert.deepEqual(await resetPasswordWithToken({
      token: rawToken, password, confirmPassword: password,
    }), { ok: true });
    assert.equal(user.status, "ACTIVE");
    assert.ok(user.emailVerified);
    assert.ok(user.passwordUpdatedAt);
    assert.equal(await compare(password, user.passwordHash!), true);
    assert.equal(tokens.length, 0);
    assert.equal((await resetPasswordWithToken({
      token: rawToken, password, confirmPassword: password,
    })).ok, false);
    assert.equal(userWrites, 1);
  });

  it("does not reactivate an account suspended during reset", async () => {
    addToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET);
    mutateAfterRead = () => { user.status = "SUSPENDED"; };
    assert.equal((await resetPasswordWithToken({
      token: rawToken, password, confirmPassword: password,
    })).ok, false);
    assert.equal(user.status, "SUSPENDED");
    assert.equal(user.passwordHash, "previous-hash");
  });

  it("rolls reset token consumption back on a failed password write", async () => {
    addToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET);
    failUserUpdate = true;
    await assert.rejects(() => resetPasswordWithToken({
      token: rawToken, password, confirmPassword: password,
    }), /User write failed/);
    assert.equal(tokens.length, 1);
    assert.equal(user.passwordHash, "previous-hash");
  });

  it("allows only one concurrent verification of the same token", async () => {
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    const results = await Promise.all([
      verifyEmailWithToken({ token: rawToken }), verifyEmailWithToken({ token: rawToken }),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(userWrites, 1);
  });

  it("serializes reset issuance so concurrent requests respect the cooldown", async () => {
    const results = await Promise.all([requestPasswordReset({ email }), requestPasswordReset({ email })]);
    assert.equal(results.every((result) => result.ok), true);
    assert.equal(lockAcquisitions, 2);
    assert.equal(tokenCreates, 1);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.identifier, authTokenIdentifier(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, email));
    assert.notEqual(tokens[0]?.token, rawToken);
  });

  it("clears an attacker-chosen stub password atomically after Google proof", async () => {
    addToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    assert.deepEqual(await takeoverUnverifiedCredentialsStub({ email }), { userId: "user", tookOver: true });
    assert.equal(user.passwordHash, null);
    assert.equal(user.status, "ACTIVE");
    assert.ok(user.passwordUpdatedAt);
    assert.equal(tokens.length, 0);
  });

  it("does not take over a stub suspended after the Google lookup", async () => {
    mutateAfterRead = () => { user.status = "SUSPENDED"; };
    assert.deepEqual(await takeoverUnverifiedCredentialsStub({ email }), { userId: "user", tookOver: false });
    assert.equal(user.status, "SUSPENDED");
    assert.equal(user.passwordHash, "previous-hash");
  });

  it("does not clear a password reset after the Google lookup", async () => {
    mutateAfterRead = () => {
      user.status = "ACTIVE";
      user.emailVerified = new Date();
      user.passwordHash = "owner-new-hash";
    };
    assert.deepEqual(await takeoverUnverifiedCredentialsStub({ email }), { userId: "user", tookOver: false });
    assert.equal(user.passwordHash, "owner-new-hash");
  });
});
