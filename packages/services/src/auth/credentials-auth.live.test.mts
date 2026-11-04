import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import type { Prisma } from "@bloqer/database";

const require = createRequire(import.meta.url);
const { prisma } = require("@bloqer/database") as typeof import("@bloqer/database");
const { assertAuditDatabaseIdentity } = require("../testing/audit-fixture") as typeof import("../testing/audit-fixture");
const {
  requestPasswordReset, resetPasswordWithToken, takeoverUnverifiedCredentialsStub, verifyEmailWithToken,
} = require("./credentials-auth.service") as typeof import("./credentials-auth.service");
const { AUTH_TOKEN_PURPOSE, authTokenIdentifier, hashAuthToken } =
  require("./credentials-token") as typeof import("./credentials-token");

describe("credentials PostgreSQL lifecycle", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false,
}, () => {
  let userId: string;
  let email: string;
  let restoreTransaction: (() => void) | undefined;
  let savedEmailKey: string | undefined;

  before(async () => { await assertAuditDatabaseIdentity(prisma); });

  beforeEach(async () => {
    email = `audit-auth-${randomUUID()}@example.test`;
    userId = randomUUID();
    savedEmailKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "";
    await prisma.user.create({
      data: { id: userId, email, status: "INVITED", passwordHash: "unverified-stub" },
    });
  });

  afterEach(async () => {
    restoreTransaction?.();
    restoreTransaction = undefined;
    if (savedEmailKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedEmailKey;
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [
      authTokenIdentifier(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, email),
      authTokenIdentifier(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, email),
    ] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  async function insertToken(purpose: "email-verify" | "password-reset") {
    const token = randomBytes(32).toString("base64url");
    await prisma.verificationToken.create({ data: {
      identifier: authTokenIdentifier(purpose, email), token: hashAuthToken(token),
      expires: new Date(Date.now() + 60_000),
    } });
    return token;
  }

  // Pause the real transaction after its user SELECT. The other connection can
  // commit suspension/reset before the conditional UPDATE reaches PostgreSQL.
  function afterUserRead(change: () => Promise<void>) {
    const original = prisma.$transaction;
    restoreTransaction = () => { prisma.$transaction = original; };
    prisma.$transaction = (async (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => {
      return original.call(prisma, async (tx: Prisma.TransactionClient) => {
        const guardedTx = new Proxy(tx, {
          get(target, key, receiver) {
            if (key !== "user") return Reflect.get(target, key, receiver);
            return new Proxy(target.user, {
              get(delegate, method, delegateReceiver) {
                if (method !== "findUnique") return Reflect.get(delegate, method, delegateReceiver);
                return async (args: Prisma.UserFindUniqueArgs) => {
                  const row = await delegate.findUnique(args);
                  await change();
                  return row;
                };
              },
            });
          },
        });
        return run(guardedTx);
      }, options);
    }) as typeof original;
  }

  it("consumes a verification token exactly once under concurrent requests", async () => {
    const token = await insertToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    const results = await Promise.all([verifyEmailWithToken({ token }), verifyEmailWithToken({ token })]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status, "ACTIVE");
  });

  it("serializes concurrent reset issuance with the database advisory lock", async () => {
    await Promise.all(Array.from({ length: 3 }, () => requestPasswordReset({ email })));
    assert.equal(await prisma.verificationToken.count({ where: {
      identifier: authTokenIdentifier(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, email),
    } }), 1);
  });

  it("serializes concurrent verification and reset without reversing token/user locks", async () => {
    const verifyToken = await insertToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    const resetToken = await insertToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET);
    const [, reset] = await Promise.all([
      verifyEmailWithToken({ token: verifyToken }),
      resetPasswordWithToken({ token: resetToken, password: "newPassword123", confirmPassword: "newPassword123" }),
    ]);
    assert.equal(reset.ok, true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.status, "ACTIVE");
    assert.notEqual(row.passwordHash, "unverified-stub");
    assert.equal(await prisma.verificationToken.count({ where: {
      identifier: { in: [
        authTokenIdentifier(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, email),
        authTokenIdentifier(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, email),
      ] },
    } }), 0);
  });

  it("preserves a suspension committed after the verification user read", async () => {
    const token = await insertToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY);
    afterUserRead(async () => {
      await prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    });
    assert.equal((await verifyEmailWithToken({ token })).ok, false);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status, "SUSPENDED");
  });

  it("preserves a suspension committed after the reset user read", async () => {
    const token = await insertToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET);
    afterUserRead(async () => {
      await prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    });
    assert.equal((await resetPasswordWithToken({
      token, password: "newPassword123", confirmPassword: "newPassword123",
    })).ok, false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.status, "SUSPENDED");
    assert.equal(row.passwordHash, "unverified-stub");
  });

  it("rejects takeover when the stub is disabled before its transactional update", async () => {
    const original = prisma.$transaction;
    restoreTransaction = () => { prisma.$transaction = original; };
    prisma.$transaction = (async (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => {
      await prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
      return original.call(prisma, run, options);
    }) as typeof original;
    assert.deepEqual(await takeoverUnverifiedCredentialsStub({ email }), { userId, tookOver: false });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.status, "SUSPENDED");
    assert.equal(row.passwordHash, "unverified-stub");
  });
});
