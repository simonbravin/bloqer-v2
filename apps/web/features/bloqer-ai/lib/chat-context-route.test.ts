import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const projectId = "a0000010-0000-4000-8000-000000000010";
function fixture() {
  const service = { actorUserId: "session-user", tenantId: "session-tenant", companyId: "session-company", roles: ["PROJECT_MANAGER"] };
  const state = { authenticated: true, denied: false, providerCalls: 0, checked: [] as string[], context: null as null | Record<string, unknown> };
  const dependencies: Record<string, unknown> = {
    "zod": { z }, "node:fs": {}, "node:path": {},
    "@/features/help/lib/search": { searchHelpArticles: () => [] },
    "@/features/help/lib/catalog": { HELP_ARTICLES: [] },
    "@/features/bloqer-ai/lib/safe-ai-content": { filterSafeAiLinks: () => [] },
    "@/features/bloqer-ai/lib/chat-history": { AI_CHAT_MAX_MESSAGE_CHARS: 8000, AI_CHAT_MAX_MESSAGES: 40 },
    "@/lib/auth": { getCurrentUser: async () => state.authenticated ? { tenantCtx: { tenantName: "Fixture" }, session: { user: { id: service.actorUserId, name: "Test" } } } : null },
    "@/lib/tenant-service-context": { buildTenantServiceContext: async () => service },
    "@/lib/ai-rate-limit": { checkAiChatRateLimit: () => ({ ok: true }) },
    "@bloqer/domain": { OVERVIEW_MODULES: ["PROJECTS"] },
    "@bloqer/services": {
      requireProjectAccess: async (id: string, ctx: unknown) => { assert.equal(ctx, service); state.checked.push(id); if (state.denied) throw new Error("PRIVATE_OTHER_COMPANY"); },
      buildAiExecutionContext: (input: Record<string, unknown>) => { state.context = input; return input; },
      getTenantModuleGate: async () => ({ isEnabled: () => true }),
      createDefaultBloqerAiToolRegistry: () => ({ definitions: () => [] }),
      aiCanViewCompanyAp: () => false, aiCanViewCompanyAr: () => false, aiCanViewTreasury: () => false,
    },
    "@bloqer/ai": {
      isBloqerAiEnabled: () => true, ensureBundledKnowledgeLoaded: () => true,
      getBloqerAiEnv: () => ({ timeoutMs: 1000 }),
      createAiProviderFromEnv: () => { state.providerCalls++; return {}; },
      buildBloqerAiSystemPrompt: () => "system",
      runAgent: async function* () { yield { type: "done", assistantText: "Fixture" }; },
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../../../app/api/ai/chat/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Response, TextEncoder, ReadableStream, AbortController, AbortSignal, require(name: string) {
    assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name];
  } });
  return { service, state, ...exports as { POST(req: Request): Promise<Response> } };
}
function request(extra: Record<string, unknown> = {}) {
  return new Request("https://bloqer.test/api/ai/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "¿Cómo viene esta obra?" }], ...extra }) });
}

test("chat denies an inaccessible explicit project without calling AI or falling back to company scope", async () => {
  const route = fixture(); route.state.denied = true;
  const response = await route.POST(request({ currentProjectId: projectId }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /PRIVATE_OTHER_COMPANY/);
  assert.deepEqual(route.state.checked, [projectId]);
  assert.equal(route.state.providerCalls, 0); assert.equal(route.state.context, null);
});

test("chat uses server identity and revalidated project despite forged authorization fields", async () => {
  const route = fixture();
  const response = await route.POST(request({ currentProjectId: projectId, tenantId: "forged", companyId: "forged", actorUserId: "forged", roles: ["OWNER"] }));
  assert.equal(response.status, 200); await response.text();
  assert.equal(route.state.context?.service, route.service);
  assert.equal(route.state.context?.currentProjectId, projectId);
  assert.deepEqual(route.state.checked, [projectId]); assert.equal(route.state.providerCalls, 1);
});

test("chat permits an intentional company context but requires an authenticated session", async () => {
  const route = fixture();
  const response = await route.POST(request()); assert.equal(response.status, 200); await response.text();
  assert.equal(route.state.context?.currentProjectId, undefined); assert.equal(route.state.context?.service, route.service);
  route.state.authenticated = false;
  assert.equal((await route.POST(request({ currentProjectId: projectId }))).status, 401);
  assert.equal(route.state.providerCalls, 1);
});
