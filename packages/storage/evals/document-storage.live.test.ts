import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageEnv } from "@bloqer/config";
import { assertTenantScopedStorageKey, buildStorageKey, getPresignedGetUrl, getPresignedPutUrl } from "../src/index";

// Existing Bloqer Demo tenant, verified in dev/neondb; never accept arbitrary tenant keys.
const DEMO_TENANT_ID = "e3d4d0f7-3ca8-4d16-9c46-b8c77f5c93db";

test("live R2 transport under a fresh Bloqer Demo key", { timeout: 90_000 }, async (t) => {
  assert.equal(process.env.BLOQER_STORAGE_LIVE, "1", "Live storage evaluation requires BLOQER_STORAGE_LIVE=1");
  const env = getStorageEnv();
  const key = buildStorageKey(DEMO_TENANT_ID, null, randomUUID(), "bloqer-pilot-synthetic.txt");
  assertTenantScopedStorageKey(DEMO_TENANT_ID, key);
  const bytes = Buffer.from("PRUEBA SINTETICA BLOQER DEMO - SIN DATOS DE CLIENTES\n");
  const mimeType = "text/plain";
  let created = false;
  let cleaned = false;
  const client = new S3Client({
    region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const send = (url: string, init?: RequestInit) => fetch(url, {
    ...init, redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  try {
    const putUrl = await getPresignedPutUrl(key, mimeType, bytes.length, 120);
    const putOptions = {
      method: "PUT", body: bytes,
      headers: { "Content-Type": mimeType, "If-None-Match": "*" },
    };
    const upload = await send(putUrl, putOptions);
    created = upload.ok;
    assert.equal(upload.status, 200, "Signed upload must succeed");
    await upload.arrayBuffer();

    const duplicate = await send(putUrl, putOptions);
    assert.equal(duplicate.status, 412, "A reused upload URL must not overwrite the object");
    await duplicate.arrayBuffer();

    const getUrl = await getPresignedGetUrl(key, {
      expiresInSeconds: 120,
      responseContentDisposition: 'attachment; filename="bloqer-pilot-synthetic.txt"',
    });
    const download = await send(getUrl);
    assert.equal(download.status, 200, "Signed download must succeed");
    assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);

    const unsignedUrl = new URL(getUrl);
    unsignedUrl.search = "";
    const unsigned = await send(unsignedUrl.href);
    assert.ok([400, 403].includes(unsigned.status), "R2 must reject a request with no signature");
    assert.notDeepEqual(Buffer.from(await unsigned.arrayBuffer()), bytes);
    t.diagnostic(JSON.stringify({ unsignedStatus: unsigned.status }));
  } catch (error) {
    // Never print presigned URLs or SDK exceptions containing credentials/request metadata.
    if (error instanceof assert.AssertionError) throw error;
    throw new Error("R2 live evaluation failed at transport or configuration; no secrets logged");
  } finally {
    try {
      if (created) {
        // Only this run's newly created object: no enumeration, prefix deletion or existing records.
        const deleteUrl = await getSignedUrl(client, new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME, Key: key,
        }), { expiresIn: 120 });
        const removed = await send(deleteUrl, { method: "DELETE" });
        assert.equal(removed.status, 204, "The synthetic object must be removed after the evaluation");
        await removed.arrayBuffer();
        cleaned = true;
      }
    } catch {
      throw new Error(`Synthetic R2 cleanup needs attention for key ${key}`);
    } finally {
      client.destroy();
      t.diagnostic(JSON.stringify({ key, created, cleaned }));
    }
  }
});
