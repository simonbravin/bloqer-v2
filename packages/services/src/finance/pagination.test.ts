import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePagination } from "./pagination";

describe("financial pagination", () => {
  it("keeps ordinary page and size contracts", () => {
    assert.deepEqual(resolvePagination({ page: 3, pageSize: 20 }), { page: 3, pageSize: 20, skip: 40, take: 20 });
    assert.deepEqual(resolvePagination({ page: -2, pageSize: -1 }), { page: 1, pageSize: 1, skip: 0, take: 1 });
    assert.equal(resolvePagination({ pageSize: 1000 }).pageSize, 100);
  });
  it("normalizes malformed and overflowing page values before Prisma", () => {
    for (const page of [NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
      const result = resolvePagination({ page });
      assert.equal(result.page, 1);
      assert.equal(result.skip, 0);
    }
  });
  it("uses a valid default size for nonfinite or fractional input", () => {
    for (const pageSize of [NaN, Infinity, -Infinity, 2.5]) {
      assert.deepEqual(resolvePagination({ page: 2, pageSize }), { page: 2, pageSize: 20, skip: 20, take: 20 });
    }
  });
});
