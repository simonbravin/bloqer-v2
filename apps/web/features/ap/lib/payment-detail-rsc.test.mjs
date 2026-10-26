import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  registerClientReference,
  registerServerReference,
  renderToReadableStream,
} from "next/dist/compiled/react-server-dom-webpack/server.node.js";

// Exercise the real page through React Flight: ordinary callbacks cannot cross
// this boundary, even when they only wrap an imported Server Action.
const pagePath = fileURLToPath(
  new URL("../../../app/(app)/proyectos/[id]/pagos/[paymentId]/page.tsx", import.meta.url),
);
const compiled = ts.transpileModule(readFileSync(pagePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function renderPayment({ status = "CONFIRMED", canCancel = true } = {}) {
  const cancelCalls = [];
  const readCalls = [];
  const cancelPaymentAction = registerServerReference(
    async (...args) => {
      cancelCalls.push(args);
      return { ok: true };
    },
    "payment-actions",
    "cancelPaymentAction",
  );
  const ConfirmActionButton = registerClientReference(
    () => {},
    "confirm-action-button",
    "ConfirmActionButton",
  );
  const container = ({ children }) => React.createElement("div", null, children);
  const ctx = { actorUserId: "user", tenantId: "tenant", companyId: "company", roles: ["FINANCE"] };
  const payment = {
    id: "payment",
    status,
    paymentDate: new Date("2026-10-08T00:00:00Z"),
    amount: "2361149.60",
    currency: "ARS",
    accountName: "Caja de obra",
    payableId: "payable",
    supplierInvoiceId: "invoice",
    paymentMethod: "CASH",
  };
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: container },
    "next/navigation": {
      notFound: () => {
        throw new Error("Unexpected notFound");
      },
      redirect: () => {
        throw new Error("Unexpected redirect");
      },
    },
    "@/lib/format": { formatDate: (date) => date.toISOString().slice(0, 10) },
    "@/lib/format-money": { formatMoneyAmount: (amount) => amount },
    "@/lib/auth": {
      getCurrentUser: async () => ({ session: { user: { id: ctx.actorUserId } }, tenantCtx: ctx }),
    },
    "@bloqer/services": {
      getPaymentById: async (...args) => {
        readCalls.push(args);
        return payment;
      },
      canRegisterApPayment: () => canCancel,
      ServiceError: class extends Error {},
    },
    "@bloqer/domain": {
      can: () => true,
      classifyAccountMovement: () => ({ classLabel: "Pago", family: "TREASURY" }),
    },
    "@/features/treasury/lib/settlement-method-label": { settlementMethodLabel: () => "Efectivo" },
    "@/app/(app)/proyectos/[id]/cuentas-por-pagar/actions": { cancelPaymentAction },
    "@/app/(app)/contabilidad/source-draft-actions": {
      generateJournalFromPaymentAction: registerServerReference(
        async () => {},
        "accounting-actions",
        "generateJournalFromPaymentAction",
      ),
    },
    "@/components/feedback/confirm-action-button": { ConfirmActionButton },
    "@/components/feedback/action-error-banner": { ActionErrorBanner: () => null },
    "@/components/ui/badge": { Badge: container },
    "@/components/ui/button": { Button: container },
    "@/components/layout/page-shell": { PageShell: container },
    "@/features/finance/components/document-class-badge": { DocumentClassBadge: () => null },
  };
  const exports = {};
  runInNewContext(
    compiled,
    {
      exports,
      require: (name) => {
        assert.ok(Object.hasOwn(modules, name), `Unmocked page dependency: ${name}`);
        return modules[name];
      },
    },
    { filename: pagePath },
  );
  const tree = await exports.default({
    params: Promise.resolve({ id: "project", paymentId: "payment" }),
    searchParams: Promise.resolve({}),
  });
  const errors = [];
  const stream = await renderToReadableStream(
    tree,
    {
      "confirm-action-button#ConfirmActionButton": {
        id: "confirm-action-button",
        chunks: [],
        name: "ConfirmActionButton",
      },
    },
    {
      onError: (error) => {
        errors.push(error.message);
      },
    },
  );
  const flight = await new Response(stream).text();
  assert.deepEqual(errors, [], "The payment detail must serialize without a server exception");
  assert.match(flight, /2361149\.60/);
  assert.deepEqual(JSON.parse(JSON.stringify(readCalls)), [["payment", ctx, "project"]]);
  assert.deepEqual(cancelCalls, [], "Opening a confirmed payment must never cancel or recreate it");

  function findCancel(node) {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === ConfirmActionButton) return node;
    return React.Children.toArray(node.props?.children).map(findCancel).find(Boolean);
  }
  return { button: findCancel(tree), cancelCalls };
}

test("confirmed payment renders and its cancellation keeps payment/project scope", async () => {
  const { button, cancelCalls } = await renderPayment();
  assert.ok(button, "Authorized users retain the cancellation confirmation");
  assert.deepEqual(await button.props.action(), { ok: true });
  assert.deepEqual(cancelCalls, [["payment", "project"]]);
});

test("confirmed payment renders for a reader without cancellation permission", async () => {
  const { button } = await renderPayment({ canCancel: false });
  assert.equal(button, undefined);
});

test("cancelled payment renders without offering another cancellation", async () => {
  const { button } = await renderPayment({ status: "CANCELLED" });
  assert.equal(button, undefined);
});
