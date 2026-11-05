import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { can } from "@bloqer/domain";
import { isFieldImmersivePath } from "@/lib/field-immersive-routes";
import { isPendingInboxPath } from "@/lib/field-pending-path";
import { fieldQuickActionHref, listFieldQuickActions } from "@/lib/field-quick-actions";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });

function descendants(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => descendants(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...descendants(node.props.children, type)];
}

function loadComponent<T>(filename: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked Field dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

const currentProject = "11111111-1111-4111-8111-111111111111";
const staleProject = "22222222-2222-4222-8222-222222222222";

function bottomNav(pathname: string, projectsEnabled = true) {
  const pathProjectId = pathname.startsWith(`/proyectos/${currentProject}`) ? currentProject : null;
  const component = loadComponent<{ FieldBottomNav: (props: unknown) => unknown }>("./field-bottom-nav.tsx", {
    react: { useState: () => [false, () => {}], useRef: () => ({ current: null }) },
    "next/link": { default: "link" },
    "next/navigation": { usePathname: () => pathname },
    "lucide-react": { ClipboardList: "icon", HardHat: "icon", Home: "icon", Menu: "icon", Plus: "icon" },
    "@bloqer/domain": { can },
    "@/lib/utils": { cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") },
    "@/lib/field-immersive-routes": { isFieldImmersivePath },
    "@/lib/field-pending-path": { isPendingInboxPath },
    "@/lib/field-project-context": { useFieldProjectContext: () => ({ pathProjectId, convenienceProjectId: staleProject }) },
    "@/lib/pending-count-badge": { pendingCountAriaLabel: () => "Pendientes" },
    "@/lib/pending-inbox-count-context": { usePendingInboxCount: () => ({ tenantCount: 0 }) },
    "@/components/ui/pending-count-badge": { PendingCountBadge: "badge" },
    "./field-plus-sheet": { FieldPlusSheet: "plus-sheet" },
    "./field-more-sheet": { FieldMoreSheet: "more-sheet" },
  });
  return component.FieldBottomNav({ roles: ["OWNER"], moduleGateSnapshot: { PROJECTS: projectsEnabled } });
}

test("Obra and Más cannot turn a stale saved UUID into project navigation from global pages", () => {
  const tree = bottomNav("/dashboard");
  const obra = descendants(tree, "link").find((node) => node.props["aria-label"] === "Obra");
  assert.equal(obra?.props.href, "/proyectos");
  assert.equal(descendants(tree, "more-sheet")[0]!.props.projectId, null);
});

test("Obra marks the projects index active, retains the current route, and respects its module gate", () => {
  const index = descendants(bottomNav("/proyectos"), "link").find((node) => node.props["aria-label"] === "Obra");
  assert.equal(index?.props["aria-current"], "page");
  const scoped = descendants(bottomNav(`/proyectos/${currentProject}/libro-obra`), "link")
    .find((node) => node.props["aria-label"] === "Obra");
  assert.equal(scoped?.props.href, `/proyectos/${currentProject}`);
  assert.equal(descendants(bottomNav("/dashboard", false), "link").some((node) => node.props["aria-label"] === "Obra"), false);
});

test("Registrar reuses a path or saved project only if the eligible list includes it", () => {
  for (const [pathProjectId, visible] of [[null, false], [null, true], [currentProject, false], [currentProject, true]] as const) {
    const preferred = pathProjectId ?? staleProject;
    const state: unknown[] = [false, null, visible ? [{ id: preferred }] : [], false, null, 0];
    let stateIndex = 0;
    const pushed: string[] = [];
    const component = loadComponent<{ FieldPlusSheet: (props: unknown) => unknown }>("./field-plus-sheet.tsx", {
      react: {
        useEffect: () => {},
        useState: () => {
          const index = stateIndex++;
          return [state[index], (next: unknown) => { state[index] = next; }];
        },
      },
      "next/navigation": { useRouter: () => ({ push: (href: string) => pushed.push(href) }) },
      "@/components/ui/button": { Button: "button" },
      "@/components/ui/sheet": {
        Sheet: "sheet", SheetContent: "sheet-content", SheetDescription: "description", SheetHeader: "header", SheetTitle: "title",
      },
      "@/features/projects/tenant-gate-from-snapshot": { tenantGateFromSnapshot: () => ({ isEnabled: () => true }) },
      "@/lib/field-project-context": { useFieldProjectContext: () => ({ pathProjectId }) },
      "@/lib/field-quick-actions": { fieldQuickActionHref, listFieldQuickActions },
      "./field-project-picker": { FieldProjectPickerSheet: "picker" },
    });
    const tree = component.FieldPlusSheet({ open: true, onOpenChange: () => {}, roles: ["OWNER"], moduleGateSnapshot: {}, convenienceProjectId: staleProject });
    const button = descendants(tree, "button").find((node) => node.props.children === "Nuevo parte");
    assert.ok(button);
    (button.props.onClick as () => void)();
    assert.deepEqual(pushed, visible ? [`/proyectos/${preferred}/libro-obra/nuevo`] : []);
    assert.equal(state[0], !visible);
  }
});
