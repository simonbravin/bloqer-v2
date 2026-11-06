import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Element = { type: string; props: Record<string, unknown> };
type Ref = { current: unknown };
const jsx = (type: string, props: Element["props"]): Element => ({ type, props });
const { outputText } = ts.transpileModule(
  readFileSync(new URL("./process-stepper.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
);

function mountStepper(activeBounds: { left: number; right: number }, reducedMotion = false) {
  const scrolls: ScrollToOptions[] = [];
  const effects: (() => void)[] = [];
  const frames: (() => void)[] = [];
  const exports: { ProcessStepper?: (props: unknown) => Element } = {};
  const deps: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useEffect: (fn: () => void) => effects.push(fn),
      useId: () => "step-summary",
      useRef: () => ({ current: null }),
    },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
  };
  runInNewContext(outputText, {
    exports,
    require(name: string) {
      assert.ok(Object.hasOwn(deps, name), name);
      return deps[name];
    },
    window: {
      matchMedia: () => ({ matches: reducedMotion }),
      requestAnimationFrame: (fn: () => void) => frames.push(fn),
    },
  });
  const root = exports.ProcessStepper!({
    steps: [
      { id: "draft", label: "Borrador", state: "done" },
      { id: "receive", label: "Recibir", state: "current" },
    ],
  });
  const track = (root.props.children as Element[]).find((node) => node.type === "ol")!;
  const activeStep = (track.props.children as Element[]).find((node) => node.props["aria-current"])!;
  (track.props.ref as Ref).current = {
    scrollLeft: 50,
    getBoundingClientRect: () => ({ left: 200, right: 520 }),
    scrollTo: (options: ScrollToOptions) => scrolls.push({ ...options }),
  };
  (activeStep.props.ref as Ref).current = {
    getBoundingClientRect: () => activeBounds,
    scrollIntoView() { assert.fail("The active step must not scroll the viewport or app shell"); },
  };
  effects.forEach((effect) => effect());
  frames.forEach((frame) => frame());
  return scrolls;
}

test("a clipped active step scrolls only the track and respects reduced motion", () => {
  const bounds = { left: 515, right: 595 };
  assert.deepEqual(mountStepper(bounds), [{ left: 245, behavior: "smooth" }]);
  assert.deepEqual(mountStepper(bounds, true), [{ left: 245, behavior: "auto" }]);
});

test("an already visible step does not move the track", () => {
  assert.deepEqual(mountStepper({ left: 225, right: 290 }), []);
});
