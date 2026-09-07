import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_RATE_LIMIT_USER_MESSAGE,
  checkAiChatRateLimit,
  resetAiChatRateLimitForTests,
} from "./ai-rate-limit";

test("ai rate limit blocks per user per minute", () => {
  resetAiChatRateLimitForTests();
  const cfg = { userPerMinute: 2, tenantPerHour: 100 };
  const base = {
    tenantId: "t1",
    userId: "u1",
    config: cfg,
    nowMs: 1_000_000,
  };
  assert.equal(checkAiChatRateLimit(base).ok, true);
  assert.equal(checkAiChatRateLimit(base).ok, true);
  const blocked = checkAiChatRateLimit(base);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
  assert.match(AI_RATE_LIMIT_USER_MESSAGE, /límite de consultas/i);
});

test("ai rate limit blocks per tenant per hour", () => {
  resetAiChatRateLimitForTests();
  const cfg = { userPerMinute: 100, tenantPerHour: 2 };
  const nowMs = 2_000_000;
  assert.equal(
    checkAiChatRateLimit({ tenantId: "t2", userId: "a", config: cfg, nowMs }).ok,
    true,
  );
  assert.equal(
    checkAiChatRateLimit({ tenantId: "t2", userId: "b", config: cfg, nowMs }).ok,
    true,
  );
  assert.equal(
    checkAiChatRateLimit({ tenantId: "t2", userId: "c", config: cfg, nowMs }).ok,
    false,
  );
});

test("tenant deny does not burn user quota", () => {
  resetAiChatRateLimitForTests();
  const cfg = { userPerMinute: 1, tenantPerHour: 1 };
  const nowMs = 3_000_000;
  assert.equal(
    checkAiChatRateLimit({ tenantId: "t3", userId: "u1", config: cfg, nowMs }).ok,
    true,
  );
  // Tenant exhausted; user u2 must not consume their only user slot.
  assert.equal(
    checkAiChatRateLimit({ tenantId: "t3", userId: "u2", config: cfg, nowMs }).ok,
    false,
  );
  // Different tenant — u2 still has full user quota.
  assert.equal(
    checkAiChatRateLimit({ tenantId: "t4", userId: "u2", config: cfg, nowMs }).ok,
    true,
  );
});
