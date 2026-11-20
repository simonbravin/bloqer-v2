import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { isStorageConfigured } from "@bloqer/config";

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
