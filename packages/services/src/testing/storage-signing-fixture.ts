import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { isStorageConfigured } from "@bloqer/config";
import { createRequire } from "node:module";
import { mock } from "node:test";

/** Local signing only. Callers must never PUT/GET/confirm with these synthetic credentials. */
export async function withSyntheticStorageSigning<T>(run: () => Promise<T>): Promise<T> {
  assert.equal(isStorageConfigured(), false, "Real storage credentials must not be used in SQL fixtures");
  const fixture = {
    R2_ACCOUNT_ID: randomBytes(16).toString("hex"),
    R2_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
    R2_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
    R2_BUCKET_NAME: "isolated-signing-fixture",
  };
  const previous = Object.fromEntries(Object.keys(fixture).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, fixture);
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** In-memory SDK transport for SQL integration tests. Unknown commands fail closed; no network. */
export async function withSyntheticStorageObjects<T>(run: (objects: Map<string, Buffer>) => Promise<T>): Promise<T> {
  type Command = { constructor: { name: string }; input: { Key: string; Body?: Uint8Array; Range?: string } };
  const { S3Client } = createRequire(new URL("../../../storage/package.json", import.meta.url))("@aws-sdk/client-s3") as {
    S3Client: { prototype: { send: (command: Command) => Promise<unknown> } };
  };
  const objects = new Map<string, Buffer>();
  const send = mock.method(S3Client.prototype, "send", async (command: Command) => {
    const { Key, Body, Range } = command.input;
    if (command.constructor.name === "PutObjectCommand") { objects.set(Key, Buffer.from(Body!)); return {}; }
    if (command.constructor.name === "DeleteObjectCommand") { objects.delete(Key); return {}; }
    const body = objects.get(Key);
    if (!body) throw new Error("Synthetic object missing");
    if (command.constructor.name === "HeadObjectCommand") return { ContentLength: body.length, ContentType: "application/pdf" };
    if (command.constructor.name === "GetObjectCommand") {
      const match = Range?.match(/^bytes=(\d+)-(\d+)$/);
      const bytes = match ? body.subarray(Number(match[1]), Number(match[2]) + 1) : body;
      return { ContentType: "application/pdf", Body: { transformToByteArray: async () => bytes } };
    }
    throw new Error(`Unexpected synthetic storage command: ${command.constructor.name}`);
  });
  try { return await withSyntheticStorageSigning(() => run(objects)); }
  finally { send.mock.restore(); }
}
