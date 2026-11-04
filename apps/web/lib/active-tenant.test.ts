import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isUuid } from "@bloqer/utils";
import { LAST_PROJECT_COOKIE } from "./last-project-cookie";

type TenantCookieModule = {
  ACTIVE_TENANT_COOKIE: string;
  setActiveTenantCookie: (id: string) => Promise<void>;
  clearActiveTenantCookie: () => Promise<void>;
};

function loadModule<T>(filename: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    process: { env: { NODE_ENV: "test" } },
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked cookie dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

function sessionPreferences(activeTenantId?: string) {
  const values = new Map<string, string>([[LAST_PROJECT_COOKIE, "project-from-previous-tenant"]]);
  if (activeTenantId) values.set("bloqer_active_tenant_id", activeTenantId);
  const cookieStore = {
    get: (name: string) => values.has(name) ? { value: values.get(name) } : undefined,
    set: (name: string, value: string) => { values.set(name, value); },
    delete: ({ name }: { name: string }) => { values.delete(name); },
  };
  const tenantCookies = loadModule<TenantCookieModule>("./active-tenant.ts", {
    "next/headers": { cookies: async () => cookieStore },
    "@bloqer/utils": { isUuid },
    "./last-project-cookie": { LAST_PROJECT_COOKIE },
  });
  return { tenantCookies, values };
}

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

test("tenant changes and newly accepted organizations discard the prior project preference", async () => {
  for (const previous of [tenantA, undefined]) {
    const { tenantCookies, values } = sessionPreferences(previous);
    await tenantCookies.setActiveTenantCookie(tenantB);
    assert.equal(values.get(tenantCookies.ACTIVE_TENANT_COOKIE), tenantB);
    assert.equal(values.has(LAST_PROJECT_COOKIE), false);
  }
});

test("refreshing the active organization preserves the project, and invalid tenant input changes nothing", async () => {
  const { tenantCookies, values } = sessionPreferences(tenantA);
  await tenantCookies.setActiveTenantCookie(tenantA);
  assert.equal(values.has(LAST_PROJECT_COOKIE), true);
  await tenantCookies.setActiveTenantCookie("invalid");
  assert.equal(values.get(tenantCookies.ACTIVE_TENANT_COOKIE), tenantA);
  assert.equal(values.has(LAST_PROJECT_COOKIE), true);
});

test("the sign-out action clears both organization and project preferences plus invitation state", async () => {
  const { tenantCookies, values } = sessionPreferences(tenantA);
  let clearedInvite = false;
  const actions = loadModule<{ clearActiveTenantCookieAction: () => Promise<void> }>("./auth-session-actions.ts", {
    "@/lib/active-tenant": tenantCookies,
    "@/lib/invitation-accept-token": { clearInviteAcceptToken: async () => { clearedInvite = true; } },
  });
  await actions.clearActiveTenantCookieAction();
  assert.equal(values.has(tenantCookies.ACTIVE_TENANT_COOKIE), false);
  assert.equal(values.has(LAST_PROJECT_COOKIE), false);
  assert.equal(clearedInvite, true);
});
