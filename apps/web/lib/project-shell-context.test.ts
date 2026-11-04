import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { extractProjectIdFromPath } from "./shell-breadcrumb";

const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";
type Shell = { name: string; code: string; status: "ACTIVE" };
type State = { status: string; projectId?: string; shell?: Shell };

/** Execute the provider's real effects with controlled network completion order. */
function providerHarness() {
  let pathname = "/dashboard";
  let state: State = { status: "idle" };
  let effect: (() => void | (() => void)) | undefined;
  let cleanup: void | (() => void);
  const requestId = { current: 0 };
  const requests: { url: string; respond: (shell: Shell) => void }[] = [];
  const exports = {} as {
    ProjectShellProvider: (props: { children: null }) => unknown;
    invalidateProjectShellCache: (projectId: string) => void;
  };
  const dependencies: Record<string, unknown> = {
    react: {
      createContext: () => ({ Provider: "provider" }),
      useEffect: (callback: () => void | (() => void)) => { effect = callback; },
      useMemo: (callback: () => unknown) => callback(),
      useRef: () => requestId,
      useState: () => [state, (next: State) => { state = next; }],
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    },
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }) },
    "next/navigation": { usePathname: () => pathname },
    "@/lib/shell-breadcrumb": { extractProjectIdFromPath },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("./project-shell-context.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked project shell dependency: ${name}`);
      return dependencies[name];
    },
    fetch: (url: string) => new Promise((resolve) => {
      requests.push({ url, respond: (shell) => resolve({ ok: true, json: async () => shell }) });
    }),
  });
  return {
    requests,
    getState: () => state,
    invalidate: exports.invalidateProjectShellCache,
    render(path: string) {
      cleanup?.();
      pathname = path;
      exports.ProjectShellProvider({ children: null });
      cleanup = effect?.();
    },
  };
}

const flushRequests = () => new Promise<void>((resolve) => setImmediate(resolve));
const shell = (name: string): Shell => ({ name, code: name, status: "ACTIVE" });

test("a late project response cannot replace a cached project selected during navigation", async () => {
  const provider = providerHarness();
  provider.render(`/proyectos/${projectB}`);
  provider.requests[0]!.respond(shell("B"));
  await flushRequests();
  provider.render(`/proyectos/${projectA}`);
  provider.render(`/proyectos/${projectB}`);
  provider.requests[1]!.respond(shell("A"));
  await flushRequests();
  assert.equal(provider.getState().projectId, projectB);
  assert.equal(provider.getState().shell?.name, "B");
});

test("leaving the project workspace ignores a pending response instead of restoring its state", async () => {
  const provider = providerHarness();
  provider.render(`/proyectos/${projectA}`);
  provider.render("/dashboard");
  provider.requests[0]!.respond(shell("A"));
  await flushRequests();
  assert.equal(provider.getState().status, "idle");
});

test("an invalidated in-flight response cannot overwrite refreshed project details in cache", async () => {
  const provider = providerHarness();
  const path = `/proyectos/${projectA}`;
  provider.render(path);
  provider.invalidate(projectA);
  provider.render(path);
  provider.requests[1]!.respond(shell("Updated"));
  await flushRequests();
  provider.requests[0]!.respond(shell("Stale"));
  await flushRequests();
  provider.render("/dashboard");
  provider.render(path);
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.getState().shell?.name, "Updated");
});
