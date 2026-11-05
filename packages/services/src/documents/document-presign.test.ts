import assert from "node:assert/strict";
import { it } from "node:test";
import { getPresignedPutUrl } from "@bloqer/storage";

it("signs the conditional create, exact size and MIME with no provider request", async () => {
  const synthetic = {
    R2_ACCOUNT_ID: "synthetic-account",
    R2_ACCESS_KEY_ID: "synthetic-access-key",
    R2_SECRET_ACCESS_KEY: "synthetic-secret-key",
    R2_BUCKET_NAME: "synthetic-bucket",
  };
  const before = Object.fromEntries(Object.keys(synthetic).map((name) => [name, process.env[name]]));
  Object.assign(process.env, synthetic);
  try {
    const url = new URL(await getPresignedPutUrl("tenant/project/attempt/file.pdf", "application/pdf", 1024));
    assert.equal(url.hostname, "synthetic-bucket.synthetic-account.r2.cloudflarestorage.com");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
    assert.equal(url.searchParams.has("x-amz-sdk-checksum-algorithm"), false);
    const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")?.split(";");
    for (const name of ["if-none-match", "content-type", "content-length", "host"]) {
      assert.ok(signedHeaders?.includes(name), name);
    }
    const differentSize = new URL(await getPresignedPutUrl("tenant/project/attempt/file.pdf", "application/pdf", 1025));
    assert.notEqual(url.searchParams.get("X-Amz-Signature"), differentSize.searchParams.get("X-Amz-Signature"));
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
