import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { prisma } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import { removeTenantLogo, uploadTenantLogo } from "./tenant-logo.service";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OLD_KEY = `${TENANT}/branding/logo/old.png`;
const ctx: ServiceContext = { tenantId: TENANT, actorUserId: "operator", companyId: null, roles: ["ADMIN"] };
const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const upload = () => uploadTenantLogo({ originalFileName: "logo.png", mimeType: "image/png", sizeBytes: content.length, content }, ctx);

type TenantLogo = { id: string; logoStorageKey: string | null; logoMimeType: string | null };
type State = { tenant: TenantLogo; audit: Record<string, unknown>[] };
type StorageCommand = { constructor: { name: string }; input: { Key: string; Body?: Buffer } };
// Resolve the SDK from storage's own dependency tree; no test dependency is added.
const require = createRequire(import.meta.url);
const storageRequire = createRequire(require.resolve("@bloqer/storage"));
const { S3Client } = storageRequire("@aws-sdk/client-s3") as {
  S3Client: { prototype: { send: (command: StorageCommand) => Promise<unknown> } };
};

async function withLogo(
  run: (fixture: {
    state: () => State;
    objects: Map<string, Buffer>;
    failAudit: () => void;
    disableModule: () => void;
    loseCommitResponse: () => void;
  }) => Promise<void>,
  initialKey = OLD_KEY,
) {
  let committed: State = {
    tenant: { id: TENANT, logoStorageKey: initialKey, logoMimeType: "image/png" },
    audit: [],
  };
  const objects = new Map<string, Buffer>([[initialKey, content]]);
  let rejectAudit = false;
  let moduleEnabled = true;
  let rejectAfterCommit = false;
  let lockTail = Promise.resolve();
  const original = {
    send: S3Client.prototype.send,
    transaction: prisma.$transaction,
    tenant: prisma.tenant.findFirst,
    update: prisma.tenant.update,
    audit: prisma.auditLog.create,
    modules: prisma.tenantModuleSetting.findMany,
  };
  const environment = {
    R2_ACCOUNT_ID: "audit-test-account",
    R2_ACCESS_KEY_ID: "audit-test-access",
    R2_SECRET_ACCESS_KEY: "audit-test-secret",
    R2_BUCKET_NAME: "audit-test-bucket",
    R2_PUBLIC_URL: "https://assets.example.invalid",
  };
  const previousEnv = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);

  S3Client.prototype.send = async (command) => {
    if (command.constructor.name === "PutObjectCommand") {
      assert.ok(command.input.Key.startsWith(`${TENANT}/branding/logo/`));
      assert.ok(command.input.Body);
      objects.set(command.input.Key, command.input.Body);
    } else if (command.constructor.name === "DeleteObjectCommand") {
      objects.delete(command.input.Key);
    } else {
      throw new Error("Unexpected storage operation in logo test");
    }
    return {};
  };
  const delegates = (state: () => State) => ({
    tenant: {
      findFirst: async () => structuredClone(state().tenant),
      update: async ({ data }: { data: Partial<TenantLogo> }) => {
        Object.assign(state().tenant, data);
        return state().tenant;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (rejectAudit) throw new Error("audit unavailable");
        state().audit.push(data);
        return data;
      },
    },
  });
  const direct = delegates(() => committed);
  prisma.tenant.findFirst = direct.tenant.findFirst as unknown as typeof original.tenant;
  prisma.tenant.update = direct.tenant.update as unknown as typeof original.update;
  prisma.auditLog.create = direct.auditLog.create as unknown as typeof original.audit;
  prisma.tenantModuleSetting.findMany = (async () => [{ moduleKey: "TENANT_SETTINGS", isEnabled: moduleEnabled }]) as unknown as typeof original.modules;
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
      if (rejectAfterCommit) throw new Error("commit response lost");
      return result;
    } finally {
      release?.();
    }
  }) as unknown as typeof original.transaction;
  try {
    await run({
      state: () => committed,
      objects,
      failAudit: () => { rejectAudit = true; },
      disableModule: () => { moduleEnabled = false; },
      loseCommitResponse: () => { rejectAfterCommit = true; },
    });
  } finally {
    S3Client.prototype.send = original.send;
    prisma.$transaction = original.transaction;
    prisma.tenant.findFirst = original.tenant;
    prisma.tenant.update = original.update;
    prisma.auditLog.create = original.audit;
    prisma.tenantModuleSetting.findMany = original.modules;
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("concurrent uploads retain only the current logo and audit both replacements", async () => {
  await withLogo(async ({ state, objects }) => {
    await Promise.all([upload(), upload()]);
    assert.ok(state().tenant.logoStorageKey);
    assert.deepEqual([...objects.keys()], [state().tenant.logoStorageKey]);
    assert.equal(state().audit.length, 2);
    assert.ok(state().audit.every((entry) => entry.action === "TENANT_LOGO_UPLOADED"));
  });
});

test("concurrent upload and removal keep stored objects consistent with the final pointer", async () => {
  await withLogo(async ({ state, objects }) => {
    await Promise.all([upload(), removeTenantLogo(ctx)]);
    const key = state().tenant.logoStorageKey;
    assert.deepEqual([...objects.keys()], key ? [key] : []);
    assert.equal(state().audit.length, 2);
  });
});

test("concurrent removals audit the effective removal once", async () => {
  await withLogo(async ({ state, objects }) => {
    await Promise.all([removeTenantLogo(ctx), removeTenantLogo(ctx)]);
    assert.equal(state().tenant.logoStorageKey, null);
    assert.equal(objects.size, 0);
    assert.equal(state().audit.length, 1);
  });
});

test("upload audit failure rolls back the pointer and removes the uncommitted new object", async () => {
  await withLogo(async ({ state, objects, failAudit }) => {
    failAudit();
    await assert.rejects(upload, /audit unavailable/);
    assert.equal(state().tenant.logoStorageKey, OLD_KEY);
    assert.deepEqual([...objects.keys()], [OLD_KEY]);
    assert.equal(state().audit.length, 0);
  });
});

test("an uncertain commit never deletes the newly committed current logo", async () => {
  await withLogo(async ({ state, objects, loseCommitResponse }) => {
    loseCommitResponse();
    await assert.rejects(upload, /commit response lost/);
    const key = state().tenant.logoStorageKey;
    assert.ok(key && key !== OLD_KEY);
    assert.equal(objects.has(key), true);
    assert.equal(state().audit.length, 1);
  });
});

test("removal audit failure preserves the pointer and the previous object", async () => {
  await withLogo(async ({ state, objects, failAudit }) => {
    failAudit();
    await assert.rejects(() => removeTenantLogo(ctx), /audit unavailable/);
    assert.equal(state().tenant.logoStorageKey, OLD_KEY);
    assert.deepEqual([...objects.keys()], [OLD_KEY]);
    assert.equal(state().audit.length, 0);
  });
});

test("disabled settings module blocks logo writes before any storage effect", async () => {
  await withLogo(async ({ state, objects, disableModule }) => {
    disableModule();
    for (const operation of [upload, () => removeTenantLogo(ctx)]) {
      await assert.rejects(operation, (e: unknown) => e instanceof ServiceError && e.code === "FORBIDDEN");
    }
    assert.equal(state().tenant.logoStorageKey, OLD_KEY);
    assert.deepEqual([...objects.keys()], [OLD_KEY]);
    assert.equal(state().audit.length, 0);
  });
});

test("clearing a corrupt foreign pointer never deletes another tenant's object", async () => {
  const foreign = "foreign-tenant/branding/logo/foreign.png";
  await withLogo(async ({ state, objects }) => {
    await removeTenantLogo(ctx);
    assert.equal(state().tenant.logoStorageKey, null);
    assert.deepEqual([...objects.keys()], [foreign]);
    assert.deepEqual(state().audit[0]?.before, { hasLogo: true, mimeType: "image/png", invalidKeyCleared: true });
  }, foreign);
});
