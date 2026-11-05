import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validators from "@bloqer/validators";

const ids = {
  project: "11111111-1111-4111-8111-111111111111",
  otherProject: "22222222-2222-4222-8222-222222222222",
  invoice: "33333333-3333-4333-8333-333333333333",
  note: "44444444-4444-4444-8444-444444444444",
  certificate: "55555555-5555-4555-8555-555555555555",
  submittedCertificate: "66666666-6666-4666-8666-666666666666",
  receivable: "77777777-7777-4777-8777-777777777777",
  contact: "88888888-8888-4888-8888-888888888888",
};
type CacheReference = {
  id: string;
  projectId: string;
  certificationId: string | null;
  referencedSalesInvoiceId: string | null;
};
type ActionResult = { id?: string; ok?: true; error?: string };
type Actions = Record<string, (...args: unknown[]) => Promise<ActionResult>>;
class TestServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const source = readFileSync(
  new URL("../app/(app)/proyectos/[id]/facturas/actions.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function environment({ note = false, linked = true, failRead = false, failWrite = false } = {}) {
  const invalidated: Array<{ path: string; type?: string }> = [];
  const calls: Array<{ name: string; args: unknown[] }> = [];
  let committed = false;
  const invoice: CacheReference = {
    id: ids.invoice,
    projectId: ids.project,
    certificationId: linked ? ids.certificate : null,
    referencedSalesInvoiceId: null,
  };
  const document: CacheReference = note
    ? { ...invoice, id: ids.note, certificationId: null, referencedSalesInvoiceId: ids.invoice }
    : invoice;
  const services: Record<string, unknown> = {
    ServiceError: TestServiceError,
    getSalesInvoiceById: async (id: string, ctx: unknown, projectId: string) => {
      calls.push({ name: "getSalesInvoiceById", args: [id, ctx, projectId] });
      assert.equal(committed, false, "Cache discovery must never read after a committed mutation");
      if (projectId !== ids.project)
        throw new TestServiceError("FORBIDDEN", "Documento fuera de esta obra");
      if (failRead) throw new TestServiceError("FORBIDDEN", "Documento fuera del alcance");
      if (id === ids.invoice) return invoice;
      assert.equal(id, ids.note);
      return document;
    },
  };
  const mutationNames = [
    "createSalesInvoice",
    "createInvoiceFromCertification",
    "updateSalesInvoice",
    "issueSalesInvoice",
    "cancelSalesInvoice",
    "createSalesCreditNoteFromInvoice",
    "createSalesDebitNoteFromInvoice",
    "issueSalesCreditNote",
    "issueSalesDebitNote",
    "cancelSalesCreditNote",
    "cancelReceivable",
  ];
  for (const name of mutationNames) {
    services[name] = async (...args: unknown[]) => {
      calls.push({ name, args });
      if (failWrite) throw new TestServiceError("CONFLICT", "La operación no se pudo completar");
      committed = true;
      return name === "cancelReceivable"
        ? { id: ids.receivable, projectId: ids.project, salesInvoiceId: ids.invoice }
        : document;
    };
  }
  const context = {
    actorUserId: "actor",
    tenantId: "tenant",
    companyId: "company",
    roles: ["OWNER"],
  };
  const dependencies: Record<string, unknown> = {
    "@bloqer/services": services,
    "@bloqer/validators": validators,
    "@/lib/auth": {
      getCurrentUser: async () => ({
        session: { user: { id: context.actorUserId } },
        tenantCtx: context,
      }),
    },
    "@/lib/revalidate-project-paths": {
      revalidateOperationalFinancePaths: (projectId?: string) => invalidated.push({ path: `operational-finance:${projectId ?? "company"}` }),
      revalidateProjectCostAndFinancePaths: (projectId: string) =>
        invalidated.push({ path: `finance:${projectId}` }),
      revalidateTreasuryPaths: () => invalidated.push({ path: "treasury" }),
    },
    "next/cache": {
      revalidatePath: (path: string, type?: string) =>
        invalidated.push({ path, ...(type ? { type } : {}) }),
    },
    "next/navigation": {
      redirect: (path: string) => {
        throw new Error(`REDIRECT:${path}`);
      },
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected action dependency: ${name}`);
      return dependencies[name];
    },
  });
  return { actions: exports as Actions, calls, invalidated, context, invoice, document };
}

function assertCertificateInvalidation(invalidated: Array<{ path: string }>) {
  const paths = invalidated.map((entry) => entry.path);
  for (const suffix of [
    "certificaciones",
    `certificaciones/${ids.certificate}`,
    `certificaciones/${ids.certificate}/editar`,
    "reportes/certificaciones",
    "reportes/avances",
    "facturas",
    "cuentas-por-cobrar",
  ])
    assert.ok(
      paths.includes(`/proyectos/${ids.project}/${suffix}`),
      `Missing derived cache: ${suffix}`,
    );
  assert.ok(paths.includes("/finanzas/cuentas-por-cobrar"));
  assert.ok(paths.includes("/pendientes"));
  assert.ok(paths.includes(`finance:${ids.project}`));
  assert.ok(paths.every((path) => !path.includes(ids.otherProject)));
  assert.ok(!paths.some((path) => path === "/proyectos" || path === "/"));
}

test("invoice-from-certificate creation invalidates the real service-returned certificate and invoice", async () => {
  const env = environment();
  const result = await env.actions.createInvoiceFromCertificationAction!(ids.project, {
    certificationId: ids.submittedCertificate,
    issueDate: "2026-11-05",
    dueDate: "2026-11-30",
  });
  assert.equal(result.id, ids.invoice);
  assertCertificateInvalidation(env.invalidated);
  assert.ok(
    env.invalidated.some(
      (entry) => entry.path === `/proyectos/${ids.project}/facturas/${ids.invoice}/editar`,
    ),
  );
  assert.ok(!env.invalidated.some((entry) => entry.path.includes(ids.submittedCertificate)));
  assert.equal(env.calls.filter((call) => call.name === "getSalesInvoiceById").length, 0);
  assert.equal(env.calls[0]!.args[2], ids.project);
});

for (const action of [
  "updateSalesInvoiceAction",
  "issueSalesInvoiceAction",
  "cancelSalesInvoiceAction",
] as const) {
  for (const note of [false, true]) {
    // Fiscal notes have their own issue services; only update and cancellation share invoice actions.
    if (note && action === "issueSalesInvoiceAction") continue;
    test(`${action} invalidates a ${note ? "note parent certificate" : "direct certificate"} without post-commit reads`, async () => {
      const env = environment({ note });
      const result = await env.actions[action]!(env.document.id, ids.project,
        action === "updateSalesInvoiceAction" ? { notes: "Synthetic edit" } : "Synthetic cancellation");
      assert.equal(result.ok, true);
      assertCertificateInvalidation(env.invalidated);
      const reads = env.calls.filter((call) => call.name === "getSalesInvoiceById");
      assert.deepEqual(
        reads.map((call) => call.args[0]),
        note ? [ids.note, ids.invoice] : [ids.invoice],
      );
      const mutation = env.calls.at(-1)!;
      assert.equal(mutation.args[0], env.document.id);
      assert.equal(mutation.args[action === "updateSalesInvoiceAction" ? 3 : 2], ids.project);
      assert.ok(
        env.invalidated.some(
          (entry) => entry.path === `/proyectos/${ids.project}/facturas/${env.document.id}`,
        ),
      );
      if (note)
        assert.ok(
          env.invalidated.some(
            (entry) => entry.path === `/proyectos/${ids.project}/facturas/${ids.invoice}`,
          ),
        );
    });
  }
}

for (const action of [
  "createSalesCreditNoteFromInvoiceAction",
  "createSalesDebitNoteFromInvoiceAction",
] as const) {
  test(`${action} captures the scoped parent before mutation and invalidates its certificate`, async () => {
    const env = environment({ note: true });
    const result = await env.actions[action]!(ids.invoice, ids.project);
    assert.equal(result.id, ids.note);
    assert.deepEqual(
      env.calls.map((call) => call.name),
      ["getSalesInvoiceById", action.replace("Action", "")],
    );
    assert.equal(env.calls[0]!.args[2], ids.project);
    assertCertificateInvalidation(env.invalidated);
    assert.ok(
      env.invalidated.some(
        (entry) => entry.path === `/proyectos/${ids.project}/facturas/${ids.invoice}`,
      ),
    );
  });
}

for (const action of [
  "issueSalesCreditNoteAction",
  "issueSalesDebitNoteAction",
  "cancelSalesCreditNoteAction",
] as const) {
  test(`${action} resolves its actual parent and refreshes certificate settlement consumers`, async () => {
    const env = environment({ note: true });
    assert.equal((await env.actions[action]!(ids.note, ids.project)).ok, true);
    assert.deepEqual(
      env.calls.map((call) => call.name),
      ["getSalesInvoiceById", "getSalesInvoiceById", action.replace("Action", "")],
    );
    assert.deepEqual(
      env.calls.slice(0, 2).map((call) => call.args[0]),
      [ids.note, ids.invoice],
    );
    assertCertificateInvalidation(env.invalidated);
  });
}

for (const failure of ["read", "write"] as const) {
  test(`failed ${failure} does not invalidate or report success for a note mutation`, async () => {
    const env = environment({
      note: true,
      failRead: failure === "read",
      failWrite: failure === "write",
    });
    const result = await env.actions.issueSalesCreditNoteAction!(ids.note, ids.project);
    assert.ok(result.error);
    assert.equal(result.ok, undefined);
    assert.deepEqual(env.invalidated, []);
    if (failure === "read") assert.equal(env.calls.length, 1);
  });
}

test("manual invoice creation does not guess a certification from the current route", async () => {
  const env = environment({ linked: false });
  const result = await env.actions.createSalesInvoiceAction!(ids.project, {
    projectId: ids.project,
    clientContactId: ids.contact,
    issueDate: "2026-11-05",
    dueDate: "2026-11-30",
    lines: [{ description: "Synthetic sale", quantity: "1", unitPrice: "2" }],
  });
  assert.equal(result.id, ids.invoice);
  assert.ok(
    env.invalidated.some(
      (entry) => entry.path === `/proyectos/${ids.project}/facturas/${ids.invoice}`,
    ),
  );
  assert.ok(!env.invalidated.some((entry) => entry.path.includes("certificaciones")));
  assert.equal(env.calls.filter((call) => call.name === "getSalesInvoiceById").length, 0);
});

test("notes on a manual invoice refresh invoice/AR without inventing a certificate link", async () => {
  const env = environment({ note: true, linked: false });
  assert.equal((await env.actions.issueSalesDebitNoteAction!(ids.note, ids.project)).ok, true);
  assert.ok(
    env.invalidated.some(
      (entry) => entry.path === `/proyectos/${ids.project}/facturas/${ids.invoice}`,
    ),
  );
  assert.ok(!env.invalidated.some((entry) => entry.path.includes("certificaciones")));
});

test("invalid invoice data cannot mutate or invalidate a certificate", async () => {
  const env = environment();
  assert.ok(
    (
      await env.actions.createInvoiceFromCertificationAction!(ids.project, {
        certificationId: ids.submittedCertificate,
        issueDate: "invalid",
        dueDate: "2026-11-30",
      })
    ).error,
  );
  assert.deepEqual(env.calls, []);
  assert.deepEqual(env.invalidated, []);
});

test("a scoped source read rejects another project before a note mutation or invalidation", async () => {
  const env = environment({ note: true });
  assert.ok((await env.actions.cancelSalesCreditNoteAction!(ids.note, ids.otherProject)).error);
  assert.deepEqual(
    env.calls.map((call) => call.name),
    ["getSalesInvoiceById"],
  );
  assert.equal(env.calls[0]!.args[2], ids.otherProject);
  assert.deepEqual(env.invalidated, []);
});

for (const failWrite of [false, true]) {
  test(`receivable cancellation ${failWrite ? "failure leaves caches untouched" : "refreshes only its authorized project layout without a financial getter"}`, async () => {
    const env = environment({ failWrite });
    const result = await env.actions.cancelReceivableAction!(ids.receivable, ids.project);
    assert.deepEqual(
      env.calls.map((call) => call.name),
      ["cancelReceivable"],
    );
    assert.equal(env.calls[0]!.args[2], ids.project);
    if (failWrite) {
      assert.ok(result.error);
      assert.deepEqual(env.invalidated, []);
    } else {
      assert.equal(result.ok, true);
      assert.deepEqual(
        env.invalidated.filter((entry) => entry.type),
        [{ path: `/proyectos/${ids.project}`, type: "layout" }],
      );
      assert.ok(!env.invalidated.some((entry) => entry.path === "/proyectos"));
    }
  });
}
