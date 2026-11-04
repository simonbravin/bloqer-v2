import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function environment(search = "budgetId=budget&costType=MATERIAL&page=3", minLength = 0) {
  const pushed: string[] = [];
  const timers = new Map<number, () => void>();
  const reference = { current: null as unknown };
  let nextId = 1;
  let cleanup: (() => void) | undefined;
  const dependencies: Record<string, unknown> = {
    react: {
      useRef: () => reference,
      useCallback: (fn: unknown) => fn,
      useEffect: (effect: () => (() => void)) => { cleanup = effect(); },
    },
    "next/navigation": {
      useRouter: () => ({ replace: (path: string) => pushed.push(path) }),
      usePathname: () => "/proyectos/obra/control-costos",
      useSearchParams: () => new URLSearchParams(search),
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("./use-debounced-search-param.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, URLSearchParams, setTimeout: (fn: () => void) => { const id = nextId++; timers.set(id, fn); return id; }, clearTimeout: (id: number) => timers.delete(id), require: (name: string) => dependencies[name] });
  const hook = (exports as { useDebouncedSearchParam: (name: string, delay: number, options: { minLength: number }) => { setDebounced: (value: string) => void; cancelPending: () => void } }).useDebouncedSearchParam("wbsSearch", 300, { minLength });
  return { hook, pushed, cleanup: () => cleanup?.(), tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); } };
}

test("a debounced search preserves other filters and publishes only the latest value", () => {
  const env = environment();
  env.hook.setDebounced("Cem"); env.hook.setDebounced("Cemento"); env.tick();
  assert.deepEqual(env.pushed, ["/proyectos/obra/control-costos?budgetId=budget&costType=MATERIAL&wbsSearch=Cemento"]);
});

test("cancellation prevents an old search from restoring cleared or newly applied filters", () => {
  const env = environment();
  env.hook.setDebounced("Cemento"); env.hook.cancelPending(); env.tick();
  assert.deepEqual(env.pushed, []);
  env.hook.setDebounced("Hormigón"); env.tick();
  assert.match(env.pushed[0]!, /wbsSearch=Hormig%C3%B3n/);
});

test("cleanup cancels work after unmount and an undersized query removes the search filter", () => {
  const env = environment("wbsSearch=Cemento&costType=LABOR", 3);
  env.hook.setDebounced("Hormigón"); env.cleanup(); env.tick();
  assert.deepEqual(env.pushed, []);
  env.hook.setDebounced("x"); env.tick();
  assert.deepEqual(env.pushed, ["/proyectos/obra/control-costos?costType=LABOR"]);
});
