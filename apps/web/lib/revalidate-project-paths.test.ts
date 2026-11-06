import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("cost and finance mutations invalidate Avances for the affected project", () => {
  const paths: string[] = [];
  const exports = {} as { revalidateProjectCostAndFinancePaths: (projectId: string) => void };
  const source = readFileSync(new URL("./revalidate-project-paths.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  runInNewContext(outputText, {
    exports,
    require(name: string) {
      assert.equal(name, "next/cache");
      return { revalidatePath: (path: string) => paths.push(path) };
    },
  });
  exports.revalidateProjectCostAndFinancePaths("obra-afectada");
  assert.ok(paths.includes("/proyectos/obra-afectada/reportes/avances"));
  assert.ok(paths.every((path) => path.startsWith("/proyectos/obra-afectada")));
});
