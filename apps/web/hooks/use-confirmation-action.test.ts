import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Confirmation = {
  busy: boolean;
  actionError: string | null;
  handleOpenChange: (open: boolean) => void;
  confirmAction: (action: () => void | Promise<unknown>) => Promise<void>;
};

/** Runs the real hook with controlled renders; DOM/React scheduling is covered separately. */
function confirmationHarness() {
  const states: unknown[] = [];
  const running = { current: false };
  const opened: boolean[] = [];
  let stateIndex = 0;
  let previousOpen: boolean | undefined;
  let effect: (() => void) | undefined;
  const exports = {} as {
    useConfirmationAction: (options: {
      open: boolean; pending: boolean; onOpenChange: (open: boolean) => void;
    }) => Confirmation;
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("./use-confirmation-action.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      assert.equal(name, "react");
      return {
        useRef: () => running,
        useState: (initial: unknown) => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (next: unknown) => { states[index] = next; }];
        },
        useEffect: (callback: () => void, [open]: [boolean]) => {
          if (previousOpen !== open) { effect = callback; previousOpen = open; }
        },
      };
    },
  });
  return {
    opened,
    render(open = true, pending = false) {
      stateIndex = 0;
      const result = exports.useConfirmationAction({ open, pending, onOpenChange: (next) => opened.push(next) });
      effect?.();
      effect = undefined;
      return result;
    },
  };
}

test("an in-flight confirmation blocks duplicate actions and dismissal, then allows retry", async () => {
  const harness = confirmationHarness();
  const initial = harness.render();
  let resolve!: () => void;
  let calls = 0;
  const action = () => { calls++; return new Promise<void>((done) => { resolve = done; }); };
  const inFlight = initial.confirmAction(action);
  await initial.confirmAction(action);
  initial.handleOpenChange(false);
  assert.equal(calls, 1);
  assert.equal(harness.render().busy, true);
  assert.deepEqual(harness.opened, []);
  resolve();
  await inFlight;
  const finished = harness.render();
  assert.equal(finished.busy, false);
  await finished.confirmAction(() => { calls++; });
  finished.handleOpenChange(false);
  assert.equal(calls, 2);
  assert.deepEqual(harness.opened, [false]);
});

test("a rejected confirmation shows a safe message and unlocks the next attempt", async () => {
  const harness = confirmationHarness();
  await harness.render().confirmAction(async () => { throw new Error("private server details"); });
  const failed = harness.render();
  assert.equal(failed.busy, false);
  assert.equal(failed.actionError, "No se pudo completar la acción. Volvé a intentar.");
  await failed.confirmAction(() => undefined);
  assert.equal(harness.render().actionError, null);
});

test("parent pending state blocks actions and dismissal until the parent reports completion", async () => {
  const harness = confirmationHarness();
  const pending = harness.render(true, true);
  let calls = 0;
  await pending.confirmAction(() => { calls++; });
  pending.handleOpenChange(false);
  assert.equal(pending.busy, true);
  assert.equal(calls, 0);
  assert.deepEqual(harness.opened, []);
  await harness.render(true, false).confirmAction(() => { calls++; });
  assert.equal(calls, 1);
});
