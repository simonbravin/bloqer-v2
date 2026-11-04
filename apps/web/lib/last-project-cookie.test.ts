import assert from "node:assert/strict";
import { test } from "node:test";
import { LAST_PROJECT_COOKIE, parseLastProjectIdCookie } from "./last-project-cookie";

const projectId = "11111111-1111-4111-8111-111111111111";

test("last project preference accepts only valid UUID values from its own cookie", () => {
  assert.equal(parseLastProjectIdCookie(`${LAST_PROJECT_COOKIE}=${projectId}`), projectId);
  assert.equal(parseLastProjectIdCookie(`other=value;${LAST_PROJECT_COOKIE}=${projectId}`), projectId);
  assert.equal(parseLastProjectIdCookie(`${LAST_PROJECT_COOKIE}=${projectId.replaceAll("-", "%2D")}`), projectId);
  assert.equal(parseLastProjectIdCookie(`other-${LAST_PROJECT_COOKIE}=${projectId}`), null);
  assert.equal(parseLastProjectIdCookie(`${LAST_PROJECT_COOKIE}=not-a-project`), null);
  assert.equal(parseLastProjectIdCookie(""), null);
});

test("malformed encoded preferences cannot interrupt Field navigation hydration", () => {
  for (const value of ["%", "%E0%A4%A", "%FF", "%2"]) {
    assert.equal(parseLastProjectIdCookie(`${LAST_PROJECT_COOKIE}=${value}`), null);
  }
});
