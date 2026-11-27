import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgingItem, AgingReport } from "../aging/aging.service";
import { buildFinanceManagementBrief } from "./finance-management-brief";

function item(id: string, overrides: Partial<AgingItem> = {}): AgingItem {
  return { id, companyName: "Empresa A", invoiceId: `invoice-${id}`, invoiceNumber: 1, projectId: "project-a", projectName: "Obra A",
    issueDate: "2026-11-01", dueDate: "2026-11-26", daysOverdue: 1, originalAmount: "120.00", paidAmount: "10.00", creditedAmount: "10.00", balanceDue: "100.00",
    currency: "ARS", status: "OVERDUE", bucket: "1_30", ...overrides };
}
function report(items: AgingItem[], asOfDate = "2026-11-27"): AgingReport {
  return { asOfDate, totals: null, byCurrency: {}, rows: [{ contactId: "contact", contactName: "Contacto A", currency: "ARS", totalBalance: "0", current: "0", bucket1_30: "0", bucket31_60: "0", bucket61_90: "0", bucket90Plus: "0", items }] };
}
const input = { asOfDate: "2026-11-27", companyId: "company-a", receivables: null, payables: null };

test("brief uses outstanding balances, preserves currencies and totals beyond the five source links", () => {
  const items = Array.from({ length: 7 }, (_, n) => item(String(n), { balanceDue: "0.10" }));
  items.push(item("usd", { currency: "USD", balanceDue: "7.00" }));
  const result = buildFinanceManagementBrief({ ...input, payables: report(items) }).payables.overdue!;
  assert.equal(result.count, 8);
  assert.equal(result.items.length, 5);
  assert.deepEqual(result.totals, [{ currency: "ARS", amount: "0.70" }, { currency: "USD", amount: "7.00" }]);
  assert.equal(result.items[0]!.href, "/proyectos/project-a/cuentas-por-pagar/0");
  assert.equal(result.items[0]!.companyName, "Empresa A");
});

test("today is not overdue and the seven-day horizon includes its last calendar date", () => {
  const result = buildFinanceManagementBrief({ ...input, receivables: report([
    item("old"), item("today", { daysOverdue: 0, dueDate: "2026-11-27" }),
    item("edge", { daysOverdue: 0, dueDate: "2026-12-04", projectId: null }),
    item("later", { daysOverdue: 0, dueDate: "2026-12-05" }),
  ]) });
  assert.equal(result.throughDate, "2026-12-04");
  assert.deepEqual(result.receivables.overdue!.items.map((entry) => entry.id), ["old"]);
  assert.deepEqual(result.receivables.upcoming!.items.map((entry) => entry.id), ["today", "edge"]);
  assert.equal(result.receivables.upcoming!.items[1]!.href, "/finanzas/cuentas-por-cobrar/edge");
});

test("credits, paid/cancelled obligations and sub-cent dust cannot become actionable debt", () => {
  const result = buildFinanceManagementBrief({ ...input, payables: report([
    item("credit", { creditedAmount: "120.00", balanceDue: "0.00" }),
    item("paid", { status: "PAID" }), item("cancelled", { status: "CANCELLED" }),
    item("dust", { balanceDue: "0.001" }), item("cent", { balanceDue: "0.01" }),
  ]) });
  assert.deepEqual(result.payables.overdue!.items.map((entry) => entry.id), ["cent"]);
  assert.deepEqual(result.payables.overdue!.totals, [{ currency: "ARS", amount: "0.01" }]);
});

test("unavailable or mismatched-date sources remain unknown while an available empty source stays empty", () => {
  const result = buildFinanceManagementBrief({ ...input, payables: report([]) });
  assert.equal(result.receivables.available, false);
  assert.equal(result.receivables.overdue, null);
  assert.equal(result.payables.available, true);
  assert.equal(result.payables.overdue!.count, 0);
  assert.equal(buildFinanceManagementBrief({ ...input, payables: report([item("x")], "2026-11-26") }).payables.available, false);
  assert.throws(() => buildFinanceManagementBrief({ ...input, asOfDate: "2026-02-30" }), /fecha válida/);
});
