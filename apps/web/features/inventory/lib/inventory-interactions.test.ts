import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import * as formatMoney from "../../../lib/format-money";
import { STOCK_MOVEMENT_STATUS_LABELS } from "./stock-movement-ui";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [
    ...(node.type === type ? [node] : []),
    ...Object.values(node.props).flatMap((value) => elements(value, type)),
  ];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" && "props" in tree
    ? text((tree as Element).props.children)
    : "";
}
function load<T>(
  file: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    URLSearchParams,
    ...globals,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name.startsWith("@/components/ui/"))
        return new Proxy({}, { get: (_, key) => String(key) });
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
class FormDataStub {
  constructor(private form: { fields: Record<string, string> }) {}
  get(key: string) {
    return this.form.fields[key] ?? null;
  }
}
function environment() {
  const slots: unknown[] = [],
    transitions: Promise<unknown>[] = [],
    errors: string[] = [],
    navigation: string[] = [];
  let index = 0;
  const react = {
    useState(initial: unknown) {
      const position = index++;
      if (!(position in slots))
        slots[position] = typeof initial === "function" ? initial() : initial;
      return [
        slots[position],
        (next: unknown) => {
          slots[position] = typeof next === "function" ? next(slots[position]) : next;
        },
      ];
    },
    useRef(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = { current: initial };
      return slots[position];
    },
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useEffect() {},
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [
        pending,
        (action: () => Promise<unknown>) => {
          (setPending as (value: boolean) => void)(true);
          transitions.push(
            Promise.resolve(action()).finally(() =>
              (setPending as (value: boolean) => void)(false),
            ),
          );
        },
      ];
    },
  };
  const dependencies: Record<string, unknown> = {
    react,
    sonner: { toast: { error: (message: string) => errors.push(message), success() {} } },
    "next/navigation": {
      useRouter: () => ({
        push: (url: string) => navigation.push(url),
        replace: (url: string) => navigation.push(url),
        refresh() {
          navigation.push("refresh");
        },
        back() {
          navigation.push("back");
        },
      }),
      usePathname: () => "/consumos",
      useSearchParams: () => new URLSearchParams("create=1"),
    },
    "@bloqer/utils": { toIsoDateInTimeZone },
    "@/lib/format-money": formatMoney,
    "@/lib/use-idempotency-key": {
      useIdempotencyKey: () => ({ idempotencyKey: "same-attempt", rotateIdempotencyKey() {} }),
    },
    "@/lib/searchable-options": {
      SEARCHABLE_NONE: "none",
      productsToSearchableOptions: () => [],
      wbsToSearchableOptions: () => [],
      withNoneOption: (value: unknown) => value,
      toSearchableOptions: (value: unknown) => value,
    },
  };
  const hook = load<{
    useInventoryAction: (onPending?: (pending: boolean) => void) => {
      pending: boolean;
      run(action: () => Promise<unknown>): void;
      isRunning(): boolean;
    };
  }>("./use-inventory-action.ts", dependencies);
  dependencies["../lib/use-inventory-action"] = hook;
  dependencies["@/features/inventory/lib/use-inventory-action"] = hook;
  return {
    dependencies,
    hook,
    errors,
    navigation,
    render<T>(component: () => T) {
      index = 0;
      return component();
    },
    async settle() {
      await Promise.all(transitions.splice(0));
    },
  };
}
const event = (fields: Record<string, string>) => ({
  preventDefault() {},
  currentTarget: { fields },
});
const change = (node: Element, value: string) =>
  (node.props.onValueChange as (value: string) => void)(value);
const submit = (tree: Element, fields: Record<string, string>) =>
  (elements(tree, "form")[0]!.props.onSubmit as (event: unknown) => void)(event(fields));

test("inventory mutation locks before rerender, hides private transport errors and permits a retry", async () => {
  const env = environment(),
    request = deferred<void>(),
    pending: boolean[] = [];
  let writes = 0;
  const render = () =>
    env.render(() => env.hook.useInventoryAction((value) => pending.push(value)));
  const first = render();
  first.run(() => {
    writes++;
    return request.promise;
  });
  first.run(async () => {
    writes++;
  });
  assert.equal(writes, 1);
  assert.equal(first.isRunning(), true);
  request.reject(new Error("private database failure"));
  await env.settle();
  assert.equal(env.errors.length, 1);
  assert.ok(!env.errors[0]!.includes("private"));
  assert.deepEqual(pending, [true, false]);
  assert.equal(render().pending, false);
  render().run(async () => {
    writes++;
  });
  await env.settle();
  assert.equal(writes, 2);
});

test("transfer keeps values after a rejection, submits four-decimal quantities once and never uses React action reset", async () => {
  const env = environment(),
    request = deferred<{ error: string }>(),
    sent: FormDataStub[] = [];
  const { WarehouseTransferForm } = load<{ WarehouseTransferForm: (props: unknown) => Element }>(
    "../../warehouse-transfer/components/warehouse-transfer-form.tsx",
    env.dependencies,
    { FormData: FormDataStub, window: { location: { search: "" } } },
  );
  const props = {
    warehouses: [
      { id: "source", name: "Source" },
      { id: "dest", name: "Dest" },
    ],
    products: [{ id: "product", name: "Product", unit: "m3" }],
    selectedSourceId: "source",
    selectedProductId: "product",
    sourceStockBalance: "4.1234",
    action: (fd: FormDataStub) => {
      sent.push(fd);
      return request.promise;
    },
  };
  const render = () => env.render(() => WarehouseTransferForm(props));
  change(elements(render(), "Select")[1]!, "dest");
  change(elements(render(), "DecimalInput")[0]!, "1.1234");
  const form = render();
  assert.equal(elements(form, "form")[0]!.props.action, undefined);
  const fields = { quantity: "1.1234", transferDate: "2026-11-04", notes: "keep me" };
  submit(form, fields);
  submit(form, fields);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.get("quantity"), "1.1234");
  assert.equal(elements(render(), "fieldset")[0]!.props.disabled, true);
  request.resolve({ error: "Saldo insuficiente" });
  await env.settle();
  assert.ok(text(render()).includes("Saldo insuficiente"));
  assert.equal(elements(render(), "DecimalInput")[0]!.props.value, "1.1234");
  assert.equal(elements(render(), "DecimalInput")[0]!.props.precision, 4);
  assert.ok(text(render()).includes("no una valuación"));
});

test("transfer preview is hidden when its source/product no longer matches the current selection", () => {
  const env = environment();
  const { WarehouseTransferForm } = load<{ WarehouseTransferForm: (props: unknown) => Element }>(
    "../../warehouse-transfer/components/warehouse-transfer-form.tsx",
    env.dependencies,
    { FormData: FormDataStub, window: { location: { search: "" } } },
  );
  const props = {
    warehouses: [
      { id: "source", name: "Source" },
      { id: "other", name: "Other" },
    ],
    products: [{ id: "product", name: "Product" }],
    selectedSourceId: "source",
    selectedProductId: "product",
    sourceStockBalance: "9876.12",
    action: async () => ({}),
  };
  const render = () => env.render(() => WarehouseTransferForm(props));
  assert.ok(text(render()).includes("9.876,12"));
  const source = elements(render(), "Select")[0]!;
  change(source, "other");
  assert.ok(!text(render()).includes("9.876,12"));
  assert.ok(env.navigation[0]!.includes("sourceWarehouseId=other"));
  assert.ok(env.navigation[0]!.includes("productId=product"));
});

for (const kind of ["product", "warehouse"] as const) {
  test(`${kind} editing calls its existing update contract, preserves a rejected draft and sends nullable fields`, async () => {
    const env = environment(),
      request = deferred<{ error: string }>(),
      sent: Record<string, unknown>[] = [];
    const name = kind === "product" ? "Product" : "Warehouse";
    const dependencies = {
      ...env.dependencies,
      "@/features/budgets/components/unit-select": { UnitSelect: "UnitSelect" },
      ["@/app/(app)/inventario/" + (kind === "product" ? "productos" : "depositos") + "/actions"]: {
        ["create" + name + "Action"]: async () => {
          throw new Error("must not create");
        },
        ["update" + name + "Action"]: (_id: string, payload: Record<string, unknown>) => {
          sent.push(payload);
          return request.promise;
        },
      },
    };
    const loaded = load<Record<string, (props: unknown) => Element>>(
      `../components/${kind}-form.tsx`,
      dependencies,
      { FormData: FormDataStub },
    );
    const props = {
      companyId: "company",
      [kind + "Id"]: "existing",
      initialValues: {
        sku: "ORIGINAL",
        name: "Original",
        unit: "m3",
        type: "PROJECT",
        category: null,
        description: null,
        notes: null,
        address: null,
      },
    };
    const render = () => env.render(() => loaded[name + "Form"]!(props));
    const tree = render(),
      fields = {
        name: "Edited",
        sku: "tampered",
        category: "",
        description: "",
        notes: "",
        address: "",
      };
    submit(tree, fields);
    submit(tree, fields);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.name, "Edited");
    assert.equal(sent[0]!.notes, null);
    assert.equal(Object.hasOwn(sent[0]!, "sku"), false);
    assert.equal(Object.hasOwn(sent[0]!, "companyId"), false);
    request.resolve({ error: "Cambio rechazado" });
    await env.settle();
    assert.ok(text(render()).includes("Cambio rechazado"));
    assert.equal(env.navigation.length, 0);
    assert.equal(
      elements(render(), "Input").find((n) => n.props.name === "name")!.props.defaultValue,
      "Original",
    );
    assert.ok(text(render()).includes("Guardar cambios"));
  });
}

for (const canEditUnit of [true, false]) {
  test(`product editor follows the server unit policy (${canEditUnit ? "unused" : "referenced"}) and preserves other edits after a conflict`, async () => {
    const env = environment(), sent: Record<string, unknown>[] = [];
    const { ProductForm } = load<{ ProductForm: (props: unknown) => Element }>(
      "../components/product-form.tsx",
      {
        ...env.dependencies,
        "@/features/budgets/components/unit-select": { UnitSelect: "UnitSelect" },
        "@/app/(app)/inventario/productos/actions": {
          createProductAction: async () => { throw new Error("must not create"); },
          updateProductAction: async (_id: string, payload: Record<string, unknown>) => {
            sent.push(payload);
            return { error: "La unidad quedó fija desde el primer uso." };
          },
        },
      },
      { FormData: FormDataStub },
    );
    const render = () => env.render(() => ProductForm({
      productId: "existing", canEditUnit,
      initialValues: { sku: "ORIGINAL", name: "Original", unit: "kg", category: null, description: null, notes: null },
    }));
    const tree = render();
    assert.equal(elements(tree, "UnitSelect")[0]!.props.disabled, !canEditUnit);
    assert.equal(text(tree).includes("Para operar con otra unidad"), !canEditUnit);
    if (canEditUnit) (elements(tree, "UnitSelect")[0]!.props.onChange as (value: string) => void)("ton");
    submit(render(), { name: "Edited", description: "Keep this description", notes: "" });
    await env.settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.unit, canEditUnit ? "ton" : undefined);
    assert.equal(Object.hasOwn(sent[0]!, "unit"), canEditUnit);
    assert.equal(sent[0]!.name, "Edited");
    assert.equal(sent[0]!.description, "Keep this description");
    assert.equal(elements(render(), "UnitSelect")[0]!.props.value, canEditUnit ? "ton" : "kg");
    assert.ok(text(render()).includes("La unidad quedó fija"));
    assert.equal(env.navigation.length, 0);
  });
}

test("consumption preserves a four-decimal amount and one idempotency attempt on a rejected save", async () => {
  const env = environment(),
    request = deferred<{ error: string }>(),
    sent: Record<string, unknown>[] = [],
    pending: boolean[] = [];
  const { ConsumptionForm } = load<{ ConsumptionForm: (props: unknown) => Element }>(
    "../components/consumption-form.tsx",
    {
      ...env.dependencies,
      "@/app/(app)/proyectos/[id]/consumos/actions": {
        createStockConsumptionAction: (_id: string, payload: Record<string, unknown>) => {
          sent.push(payload);
          return request.promise;
        },
      },
    },
    { FormData: FormDataStub },
  );
  const props = {
    projectId: "project",
    products: [{ id: "product", name: "Product", sku: "SKU", unit: "m3" }],
    warehouses: [{ id: "warehouse", name: "Warehouse" }],
    wbsOptions: [],
    onPendingChange: (value: boolean) => pending.push(value),
  };
  const render = () => env.render(() => ConsumptionForm(props));
  change(elements(render(), "SearchableCombobox")[0]!, "product");
  change(elements(render(), "Select")[0]!, "warehouse");
  change(elements(render(), "DecimalInput")[0]!, "0.1234");
  const form = render();
  submit(form, { quantity: "0.1234", movementDate: "2026-11-04" });
  submit(form, { quantity: "0.1234" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.quantity, "0.1234");
  assert.equal(sent[0]!.idempotencyKey, "same-attempt");
  request.resolve({ error: "Stock insuficiente" });
  await env.settle();
  assert.deepEqual(pending, [true, false]);
  assert.equal(elements(render(), "DecimalInput")[0]!.props.value, "0.1234");
  assert.ok(text(render()).includes("Stock insuficiente"));
});

for (const mobile of [false, true]) {
  test(`consumption ${mobile ? "sheet" : "dialog"} cannot close and discard its form while saving`, () => {
    const env = environment();
    const { NewStockConsumptionDialog } = load<{
      NewStockConsumptionDialog: (props: unknown) => Element;
    }>("../components/new-stock-consumption-dialog.tsx", {
      ...env.dependencies,
      "@/lib/media-query": { useHasMounted: () => true, useIsMdUp: () => !mobile },
      "./consumption-form": { ConsumptionForm: "ConsumptionForm" },
    });
    const render = () =>
      env.render(() =>
        NewStockConsumptionDialog({
          projectId: "project",
          products: [],
          warehouses: [],
          wbsOptions: [],
          defaultOpen: true,
        }),
      );
    const opened = render();
    (elements(opened, "ConsumptionForm")[0]!.props.onPendingChange as (value: boolean) => void)(
      true,
    );
    (opened.props.onOpenChange as (value: boolean) => void)(false);
    assert.equal(render().props.open, true);
    (elements(render(), "ConsumptionForm")[0]!.props.onPendingChange as (value: boolean) => void)(
      false,
    );
    (render().props.onOpenChange as (value: boolean) => void)(false);
    assert.equal(render().props.open, false);
  });
}

test("status confirmation remains open on a business rejection and blocks duplicate writes and dismissal", async () => {
  const env = environment(),
    request = deferred<{ error: string }>();
  let writes = 0;
  const { InventoryStatusAction } = load<{ InventoryStatusAction: (props: unknown) => Element }>(
    "../components/inventory-status-action.tsx",
    {
      ...env.dependencies,
      "@/components/ui/reason-alert-dialog": { ConfirmAlertDialog: "ConfirmAlertDialog" },
    },
  );
  const render = () =>
    env.render(() =>
      InventoryStatusAction({
        label: "Desactivar",
        description: "Keep history",
        action: () => {
          writes++;
          return request.promise;
        },
      }),
    );
  (elements(render(), "Button")[0]!.props.onClick as () => void)();
  const opened = render();
  const dialog = elements(opened, "ConfirmAlertDialog")[0]!;
  (dialog.props.onConfirm as () => void)();
  (dialog.props.onConfirm as () => void)();
  assert.equal(writes, 1);
  (dialog.props.onOpenChange as (value: boolean) => void)(false);
  assert.equal(elements(render(), "ConfirmAlertDialog")[0]!.props.open, true);
  request.resolve({ error: "Tiene operaciones pendientes" });
  await env.settle();
  assert.ok(
    text(elements(render(), "ConfirmAlertDialog")[0]!.props.description).includes(
      "Tiene operaciones pendientes",
    ),
  );
  assert.equal(elements(render(), "ConfirmAlertDialog")[0]!.props.open, true);
});

test("movement presentation preserves draft status and units and never infers accounting eligibility from a positive price", () => {
  const env = environment();
  const { StockMovementList } = load<{ StockMovementList: (props: unknown) => Element }>(
    "../components/stock-movement-list.tsx",
    {
      ...env.dependencies,
      "@/features/accounting": { StockMovementAccountingButton: "Accounting" },
      "@/lib/format": { formatDate: (v: string) => v },
      "../lib/stock-movement-ui": { STOCK_MOVEMENT_STATUS_LABELS },
      "./stock-movement-type-badge": { StockMovementTypeBadge: "Badge" },
      "./stock-consumption-mobile-cards": { StockConsumptionMobileCards: "Cards" },
    },
  );
  const movements = [
    {
      id: "draft",
      status: "DRAFT",
      type: "OUT",
      sourceType: "CONSUMPTION",
      movementDate: "2026-11-04",
      quantity: "1.2345",
      productUnit: "m3",
      unitCost: "100",
      totalCost: "123",
      costCurrency: null,
      costWarning: "Consumo sin valuación trazable",
      canGenerateAccountingDraft: false,
    },
  ];
  const tree = env.render(() =>
    StockMovementList({
      movements,
      accountingReturnPath: "/inventario/movimientos",
      canEditAccounting: true,
    }),
  );
  assert.ok(text(tree).includes("Borrador"));
  assert.ok(text(tree).includes("m3"));
  assert.ok(text(tree).includes("Consumo sin valuación trazable"));
  assert.equal(elements(tree, "Accounting").length, 0);
});

for (const name of ["product", "warehouse"]) {
  for (const variant of ["cards", "table"]) {
    test(`${name} ${variant} empty state offers no create action to a read-only user`, () => {
      const env = environment(),
        entity = name === "product" ? "Product" : "Warehouse",
        component = entity + (variant === "cards" ? "Cards" : "Table");
      const loaded = load<Record<string, (props: unknown) => Element>>(
        `../components/${name}-${variant}.tsx`,
        {
          ...env.dependencies,
          "next/link": { default: "Link" },
          ["./" + name + "-status-badge"]: { [entity + "StatusBadge"]: "Badge" },
          "@/lib/utils": { cn: () => "" },
        },
      );
      const tree = env.render(() =>
        loaded[component]!({
          [name === "product" ? "products" : "warehouses"]: [],
          canCreate: false,
        }),
      );
      assert.equal(tree.props.action, undefined);
    });
  }
}

class ServiceErrorStub extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const current = {
  session: { user: { id: "actor", email: "synthetic@example.test" } },
  tenantCtx: { tenantId: "tenant", companyId: "company", roles: ["OWNER"] },
};

for (const kind of ["product", "warehouse"] as const) {
  test(`${kind} actions invalidate inventory consumers only after a successful scoped mutation`, async () => {
    const calls: { name: string; args: unknown[] }[] = [],
      invalidated: unknown[] = [];
    const name = kind === "product" ? "Product" : "Warehouse",
      area = kind === "product" ? "productos" : "depositos";
    let fail = false;
    const services: Record<string, unknown> = { ServiceError: ServiceErrorStub };
    for (const operation of ["create", "update", "deactivate", "reactivate"])
      services[operation + name] = async (...args: unknown[]) => {
        calls.push({ name: operation, args });
        if (fail) throw new ServiceErrorStub("CONFLICT", "Blocked");
        return { id: "existing" };
      };
    const actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
      `../../../app/(app)/inventario/${area}/actions.ts`,
      {
        "@/lib/auth": { getCurrentUser: async () => current },
        "@bloqer/services": services,
        "@/features/inventory/lib/revalidate-inventory-paths": {
          revalidateInventoryPaths: (...args: unknown[]) => invalidated.push(args),
        },
      },
    );
    for (const operation of ["create", "update", "deactivate", "reactivate"]) {
      const fn = actions[operation + name + "Action"]!;
      await (operation === "create"
        ? fn({ name: "Name" })
        : operation === "update"
          ? fn("existing", { name: "Name" })
          : fn("existing"));
      const ctx = calls.at(-1)!.args.at(-1) as typeof current.tenantCtx & { actorUserId: string };
      assert.equal(ctx.actorUserId, "actor");
      assert.equal(ctx.companyId, "company");
      assert.equal(ctx.tenantId, "tenant");
    }
    assert.equal(invalidated.length, 4);
    fail = true;
    const failure = await actions["deactivate" + name + "Action"]!("existing");
    assert.equal(failure.error, "Blocked");
    assert.equal(invalidated.length, 4);
  });
}

test("consumption action uses the route project, authenticated company and project/stock invalidation", async () => {
  let sent: Record<string, unknown> | undefined, context: Record<string, unknown> | undefined;
  const invalidated: unknown[] = [];
  const actions = load<{
    createStockConsumptionAction: (id: string, payload: unknown) => Promise<unknown>;
  }>("../../../app/(app)/proyectos/[id]/consumos/actions.ts", {
    "@/lib/auth": { getCurrentUser: async () => current },
    "@bloqer/services": {
      ServiceError: ServiceErrorStub,
      createStockConsumption: async (
        input: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => {
        sent = input;
        context = ctx;
        return { id: "movement" };
      },
    },
    "@/features/inventory/lib/revalidate-inventory-paths": {
      revalidateInventoryPaths: (id: string) => invalidated.push(id),
    },
  });
  await actions.createStockConsumptionAction("route-project", {
    projectId: "forged-project",
    quantity: "1.2345",
  });
  assert.equal(sent!.projectId, "route-project");
  assert.equal(context!.companyId, "company");
  assert.deepEqual(invalidated, ["route-project"]);
});

test("inventory invalidation reaches report/detail layouts and the linked project cost/finance consumers", () => {
  const invalidated: unknown[][] = [],
    finance: string[] = [];
  const { revalidateInventoryPaths } = load<{ revalidateInventoryPaths: (id?: string) => void }>(
    "./revalidate-inventory-paths.ts",
    {
      "next/cache": { revalidatePath: (...args: unknown[]) => invalidated.push(args) },
      "@/lib/revalidate-project-paths": {
        revalidateProjectCostAndFinancePaths: (id: string) => finance.push(id),
      },
    },
  );
  revalidateInventoryPaths("project");
  assert.deepEqual(invalidated[0], ["/inventario", "layout"]);
  assert.deepEqual(finance, ["project"]);
  assert.ok(invalidated.some((a) => a[0] === "/proyectos/project/inventario"));
  invalidated.length = 0;
  revalidateInventoryPaths();
  assert.ok(invalidated.some((a) => a[0] === "/proyectos/[id]/consumos" && a[1] === "page"));
  assert.ok(invalidated.some((a) => a[0] === "/proyectos/[id]/ordenes-compra"));
});

test("transfer actions invalidate stock after create/cancel and preserve the framework redirect", async () => {
  const invalidated: unknown[] = [];
  const services = {
    ServiceError: ServiceErrorStub,
    createWarehouseTransfer: async () => ({ id: "transfer" }),
    cancelWarehouseTransfer: async () => ({ id: "transfer" }),
  };
  const actions = load<{
    createWarehouseTransferAction: (fd: unknown) => Promise<unknown>;
    cancelWarehouseTransferAction: (id: string) => Promise<unknown>;
  }>("../../../app/(app)/inventario/transferencias/actions.ts", {
    "@/lib/auth": { getCurrentUser: async () => current },
    "@bloqer/services": services,
    "@bloqer/validators": {
      createWarehouseTransferSchema: { safeParse: () => ({ success: true, data: {} }) },
    },
    "next/navigation": {
      redirect: (url: string) => {
        throw new Error("NEXT_REDIRECT:" + url);
      },
    },
    "@/lib/next-errors": {
      rethrowNextNavigationError: (error: Error) => {
        if (error.message.startsWith("NEXT_REDIRECT")) throw error;
      },
    },
    "@/features/inventory/lib/revalidate-inventory-paths": {
      revalidateInventoryPaths: () => invalidated.push("stock"),
    },
  });
  await assert.rejects(
    actions.createWarehouseTransferAction(new FormDataStub({ fields: {} })),
    /NEXT_REDIRECT:\/inventario\/transferencias\/transfer/,
  );
  await actions.cancelWarehouseTransferAction("transfer");
  assert.equal(invalidated.length, 2);
});

test("transfer listing forwards its warehouse filter and hides write controls from read-only roles", async () => {
  let filters: Record<string, unknown> | undefined;
  const page = load<{ default: (props: unknown) => Promise<Element> }>(
    "../../../app/(app)/inventario/transferencias/page.tsx",
    {
      "@/lib/format": { formatDate: (v: string) => v },
      "next/link": { default: "Link" },
      "next/navigation": {},
      "@bloqer/domain": { can: () => false },
      "@/lib/auth": { getCurrentUser: async () => current },
      "@bloqer/services": {
        listWarehouseTransfers: async (input: Record<string, unknown>) => {
          filters = input;
          return [];
        },
      },
      "@/features/warehouse-transfer": { WarehouseTransferStatusBadge: "Badge" },
      "@/components/layout/page-shell": { PageShell: "PageShell" },
      "@/lib/format-money": formatMoney,
    },
  );
  const tree = await page.default({ searchParams: Promise.resolve({ warehouseId: "warehouse" }) });
  assert.equal(filters!.warehouseId, "warehouse");
  assert.ok(
    !elements(tree, "Link").some((n) => n.props.href === "/inventario/transferencias/nueva"),
  );
  assert.ok(text(tree).includes("Transferencias del depósito seleccionado"));
});

for (const [mode, getter, parser] of [
  ["stock", "getStockBalanceReport", "parseStockBalanceFilters"],
  ["movimientos", "getStockMovementReport", "parseStockMovementFilters"],
]) {
  test(`${mode} report shows a recoverable validation error without fabricating an empty result`, async () => {
    let reads = 0;
    const page = load<{ default: (props: unknown) => Promise<Element> }>(
      `../../../app/(app)/inventario/reportes/${mode}/page.tsx`,
      {
        react: { Suspense: "Suspense" },
        "next/navigation": {},
        "@/lib/auth": { getCurrentUser: async () => current },
        "@bloqer/services": {
          ServiceError: ServiceErrorStub,
          [parser!]: () => {
            throw new ServiceErrorStub("VALIDATION", "Fecha inválida");
          },
          [getter!]: async () => {
            reads++;
            return [];
          },
        },
        "@/features/inventory-reports/components/inventory-report-error": {
          InventoryReportError: "InventoryReportError",
        },
        "@/features/inventory-reports": {
          StockBalanceTable: "Table",
          StockMovementReportTable: "Table",
          StockReportFilters: "Filters",
        },
        "@/features/reports": { ReportExportActions: "Exports" },
        "@/features/reports/report-email-send-dialog": { ReportEmailSendDialog: "Email" },
        "@/components/layout/page-shell": { PageShell: "PageShell" },
      },
    );
    const tree = await page.default({ searchParams: Promise.resolve({ dateFrom: "2026-02-30" }) });
    assert.equal(tree.type, "InventoryReportError");
    assert.equal(tree.props.message, "Fecha inválida");
    assert.equal(reads, 0);
    assert.equal(elements(tree, "Table").length, 0);
  });
  test(`${mode} JSON export uses authenticated context and private no-store responses`, async () => {
    let scoped: unknown;
    const route = load<{
      GET: (
        request: unknown,
      ) => Promise<{ data: unknown; init: { headers: Record<string, string> } }>;
    }>(`../../../app/api/reports/inventario/${mode}.csv/route.ts`, {
      "next/server": { NextResponse: { json: (data: unknown, init: unknown) => ({ data, init }) } },
      "@bloqer/services": {
        [getter!]: async (_filters: unknown, ctx: unknown) => {
          scoped = ctx;
          return [];
        },
        [parser!]: (value: unknown) => value,
      },
      "@bloqer/report-pdf": {},
      "@/lib/report-export-http": {
        requireReportExportContext: async () => ({ ok: true, ctx: current.tenantCtx }),
        searchParamsRecord: () => ({ format: "json" }),
      },
    });
    const response = await route.GET({});
    assert.equal(scoped, current.tenantCtx);
    assert.equal(response.init.headers["Cache-Control"], "private, no-store");
  });
}

test("adjustment report preserves the stored quantity and explains its undefined direction instead of adding a plus sign", () => {
  const env = environment();
  const { StockMovementReportTable } = load<{
    StockMovementReportTable: (props: unknown) => Element;
  }>("../../inventory-reports/components/stock-movement-report-table.tsx", {
    ...env.dependencies,
    "@/lib/format": { formatDate: (v: string) => v },
  });
  const tree = StockMovementReportTable({
    rows: [
      {
        id: "adjustment",
        movementDate: "2026-11-04",
        type: "ADJUSTMENT",
        quantity: "2.3456",
        signedQuantity: null,
        productUnit: "m3",
        costWarning: "Moneda no registrada",
        unitCost: "50",
        costCurrency: null,
      },
    ],
    showProduct: false,
    showWarehouse: false,
  });
  assert.ok(text(tree).includes("Sin dirección definida"));
  assert.ok(text(tree).includes("2,35 m3"));
  assert.ok(!text(tree).includes("+2,35"));
  assert.ok(text(tree).includes("Moneda no registrada"));
});

test("warehouse creation exposes the existing optional project link while editing never retargets it", async () => {
  const env = environment();
  let created: Record<string, unknown> | undefined;
  const { WarehouseForm } = load<{ WarehouseForm: (props: unknown) => Element }>(
    "../components/warehouse-form.tsx",
    {
      ...env.dependencies,
      "@/app/(app)/inventario/depositos/actions": {
        createWarehouseAction: async (payload: Record<string, unknown>) => {
          created = payload;
          return { id: "warehouse" };
        },
        updateWarehouseAction: async () => ({ success: true }),
      },
    },
    { FormData: FormDataStub },
  );
  const props = { companyId: "company", projects: [{ id: "project", label: "Project" }] };
  const render = () => env.render(() => WarehouseForm(props));
  change(elements(render(), "SearchableCombobox")[0]!, "project");
  submit(render(), { name: "Warehouse", address: "", notes: "" });
  await env.settle();
  assert.equal(created!.projectId, "project");
  assert.equal(created!.companyId, "company");
  const edited = env.render(() =>
    WarehouseForm({ ...props, warehouseId: "existing", projectId: "original" }),
  );
  assert.equal(elements(edited, "SearchableCombobox").length, 0);
});

test("warehouse project selector loads every authorized page in the resolved company context", async () => {
  const calls: { page: number; companyId: string }[] = [];
  const page = load<{ default: () => Promise<Element> }>(
    "../../../app/(app)/inventario/depositos/nuevo/page.tsx",
    {
      "next/navigation": {},
      "@bloqer/domain": { can: () => true },
      "@/lib/auth": { getCurrentUser: async () => current },
      "@bloqer/services": {
        resolveActiveCompanyId: async () => "company",
        getTenantModuleGate: async () => ({ isEnabled: () => true }),
        listProjects: async (filters: { page: number }, ctx: { companyId: string }) => {
          calls.push({ page: filters.page, companyId: ctx.companyId });
          return {
            total: 101,
            data:
              filters.page === 1
                ? [{ id: "first", code: "P1", name: "First" }]
                : [{ id: "last", code: "P101", name: "Last" }],
          };
        },
      },
      "@/features/inventory": { WarehouseForm: "WarehouseForm" },
      "@/components/layout/page-shell": { PageShell: "PageShell" },
    },
  );
  const tree = await page.default(),
    form = elements(tree, "WarehouseForm")[0]!;
  assert.deepEqual(calls, [
    { page: 1, companyId: "company" },
    { page: 2, companyId: "company" },
  ]);
  assert.equal((form.props.projects as unknown[]).length, 2);
});

test("historical CLOSED warehouse remains readable without edit or reactivation controls", async () => {
  const page = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/inventario/depositos/[warehouseId]/page.tsx", { "next/link": { default: "Link" }, "next/navigation": {}, "@bloqer/domain": { can: () => true }, "@/lib/auth": { getCurrentUser: async () => current }, "@bloqer/services": { ServiceError: ServiceErrorStub, getWarehouseById: async () => ({ id: "closed", name: "Legacy closed", status: "CLOSED", type: "CENTRAL" }), listStockMovements: async () => [] }, "@/features/inventory": { WarehouseStatusBadge: "Badge", StockMovementList: "Movements" }, "@/features/inventory/components/inventory-status-action": { InventoryStatusAction: "InventoryStatusAction" }, "../actions": {}, "@/components/layout/page-shell": { PageShell: "PageShell" } });
  const tree = await page.default({ params: Promise.resolve({ warehouseId: "closed" }) });
  assert.ok(text(tree).includes("Legacy closed"));
  assert.equal(elements(tree, "InventoryStatusAction").length, 0);
  assert.ok(!elements(tree, "Link").some(node => String(node.props.href).endsWith("/editar")));
});
