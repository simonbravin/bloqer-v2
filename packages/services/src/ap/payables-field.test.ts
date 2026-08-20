import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comparePayablesFieldRows,
  filterAndSortPayablesFieldRows,
  formatSupplierInvoiceCode,
  isPayablesFieldOpen,
  limitPayablesFieldRows,
  matchesPayablesFieldSearch,
  parsePayablesFieldFilter,
  PAYABLES_FIELD_LIST_LIMIT,
  payablesFieldTodayIso,
  payablesFieldUrgency,
  summarizePayablesFieldKpis,
  type PayablesFieldRow,
} from "./payables-field";

function row(
  partial: Partial<PayablesFieldRow> & Pick<PayablesFieldRow, "id" | "supplierName">,
): PayablesFieldRow {
  return {
    supplierInvoiceId: `inv-${partial.id}`,
    supplierInvoiceCode: "FP-09101",
    projectId: "proj-1",
    projectName: "Obra demo",
    issueDateIso: "2026-08-01",
    dueDateIso: "2026-08-25",
    currency: "ARS",
    originalAmount: "100000.00",
    paidAmount: "0.00",
    balanceDue: "100000.00",
    status: "OPEN",
    ...partial,
  };
}

const TODAY = "2026-08-20";

describe("parsePayablesFieldFilter", () => {
  it("parses canonical ids", () => {
    assert.equal(parsePayablesFieldFilter("pending"), "pending");
    assert.equal(parsePayablesFieldFilter("overdue"), "overdue");
    assert.equal(parsePayablesFieldFilter("upcoming"), "upcoming");
    assert.equal(parsePayablesFieldFilter("paid"), "paid");
    assert.equal(parsePayablesFieldFilter("vencidas"), null);
    assert.equal(parsePayablesFieldFilter(null), null);
  });
});

describe("payablesFieldTodayIso", () => {
  it("uses UTC calendar day", () => {
    assert.equal(payablesFieldTodayIso(new Date("2026-08-20T03:00:00.000Z")), "2026-08-20");
    assert.equal(payablesFieldTodayIso(new Date("2026-08-20T23:30:00.000Z")), "2026-08-20");
  });
});

describe("urgency (UTC due date, due today is not overdue)", () => {
  it("overdue when due < today and open", () => {
    assert.equal(
      payablesFieldUrgency(row({ id: "a", supplierName: "A", dueDateIso: "2026-08-19" }), TODAY),
      "overdue",
    );
  });
  it("due today", () => {
    assert.equal(
      payablesFieldUrgency(row({ id: "b", supplierName: "B", dueDateIso: TODAY }), TODAY),
      "due_today",
    );
  });
  it("upcoming when due > today", () => {
    assert.equal(
      payablesFieldUrgency(row({ id: "c", supplierName: "C", dueDateIso: "2026-08-27" }), TODAY),
      "upcoming",
    );
  });
  it("paid when no open balance", () => {
    assert.equal(
      payablesFieldUrgency(
        row({
          id: "d",
          supplierName: "D",
          status: "PAID",
          paidAmount: "100000.00",
          balanceDue: "0.00",
        }),
        TODAY,
      ),
      "paid",
    );
  });
  it("cancelled stays cancelled", () => {
    assert.equal(
      payablesFieldUrgency(row({ id: "e", supplierName: "E", status: "CANCELLED" }), TODAY),
      "cancelled",
    );
  });
});

describe("open balance", () => {
  it("cent remains open; sub-cent does not", () => {
    assert.equal(isPayablesFieldOpen(row({ id: "c", supplierName: "C", balanceDue: "0.01" })), true);
    assert.equal(
      isPayablesFieldOpen(row({ id: "d", supplierName: "D", balanceDue: "0.009", status: "OPEN" })),
      false,
    );
  });
  it("PAID / CANCELLED are not open", () => {
    assert.equal(
      isPayablesFieldOpen(row({ id: "p", supplierName: "P", status: "PAID", balanceDue: "10.00" })),
      false,
    );
    assert.equal(
      isPayablesFieldOpen(row({ id: "x", supplierName: "X", status: "CANCELLED", balanceDue: "10.00" })),
      false,
    );
  });
});

describe("filters / search / sort", () => {
  const rows: PayablesFieldRow[] = [
    row({ id: "over", supplierName: "Aceros", dueDateIso: "2026-08-10", supplierInvoiceCode: "FP-09101" }),
    row({ id: "today", supplierName: "Cemento", dueDateIso: TODAY, supplierInvoiceCode: "FP-09102" }),
    row({
      id: "soon",
      supplierName: "Pinturas",
      dueDateIso: "2026-08-28",
      balanceDue: "50000.00",
      supplierInvoiceCode: "FP-09103",
    }),
    row({
      id: "paid",
      supplierName: "Vidrios",
      status: "PAID",
      paidAmount: "100000.00",
      balanceDue: "0.00",
      dueDateIso: "2026-07-01",
      supplierInvoiceCode: "FP-09104",
    }),
  ];

  it("pending default excludes paid", () => {
    const pending = filterAndSortPayablesFieldRows(rows, "pending", TODAY, "");
    assert.deepEqual(
      pending.map((r) => r.id),
      ["over", "today", "soon"],
    );
  });

  it("overdue filter", () => {
    const overdue = filterAndSortPayablesFieldRows(rows, "overdue", TODAY, "");
    assert.deepEqual(
      overdue.map((r) => r.id),
      ["over"],
    );
  });

  it("upcoming includes due today and future", () => {
    const upcoming = filterAndSortPayablesFieldRows(rows, "upcoming", TODAY, "");
    assert.deepEqual(
      upcoming.map((r) => r.id),
      ["today", "soon"],
    );
  });

  it("paid filter", () => {
    const paid = filterAndSortPayablesFieldRows(rows, "paid", TODAY, "");
    assert.deepEqual(
      paid.map((r) => r.id),
      ["paid"],
    );
  });

  it("search supplier / invoice", () => {
    assert.equal(matchesPayablesFieldSearch(rows[0]!, "aceros"), true);
    assert.equal(matchesPayablesFieldSearch(rows[0]!, "09101"), true);
    assert.equal(matchesPayablesFieldSearch(rows[0]!, "vidrio"), false);
    const found = filterAndSortPayablesFieldRows(rows, "pending", TODAY, "Pinturas");
    assert.deepEqual(
      found.map((r) => r.id),
      ["soon"],
    );
  });

  it("sorts overdue first, not alpha", () => {
    const a = row({ id: "z", supplierName: "AAA", dueDateIso: "2026-08-30" });
    const b = row({ id: "y", supplierName: "ZZZ", dueDateIso: "2026-08-01" });
    assert.ok(comparePayablesFieldRows(b, a, TODAY) < 0);
  });
});

describe("cap after filter", () => {
  it("slices after filter so a later overdue still appears in Vencidas", () => {
    const many = Array.from({ length: PAYABLES_FIELD_LIST_LIMIT + 5 }, (_, i) =>
      row({
        id: `n${i}`,
        supplierName: `Prov ${String(i).padStart(3, "0")}`,
        dueDateIso: "2026-09-01",
        status: "OPEN",
      }),
    );
    const overdue = row({
      id: "late-overdue",
      supplierName: "Vencida al final",
      dueDateIso: "2026-08-01",
    });
    const all = [...many, overdue];
    const pending = filterAndSortPayablesFieldRows(all, "pending", TODAY, "");
    const { visible, truncated, matchedCount } = limitPayablesFieldRows(pending);
    assert.equal(truncated, true);
    assert.equal(matchedCount, PAYABLES_FIELD_LIST_LIMIT + 6);
    assert.equal(visible.length, PAYABLES_FIELD_LIST_LIMIT);
    assert.equal(visible[0]?.id, "late-overdue");

    const onlyOverdue = filterAndSortPayablesFieldRows(all, "overdue", TODAY, "");
    assert.equal(onlyOverdue[0]?.id, "late-overdue");
    assert.equal(limitPayablesFieldRows(onlyOverdue).truncated, false);
  });
});

describe("kpis", () => {
  it("counts over the full loaded set", () => {
    const rows = [
      row({ id: "o", supplierName: "O", dueDateIso: "2026-08-01" }),
      row({ id: "u", supplierName: "U", dueDateIso: "2026-08-28" }),
      row({
        id: "p",
        supplierName: "P",
        status: "PAID",
        paidAmount: "1.00",
        balanceDue: "0.00",
      }),
    ];
    const kpis = summarizePayablesFieldKpis(rows, TODAY);
    assert.equal(kpis.pending, 2);
    assert.equal(kpis.overdue, 1);
    assert.equal(kpis.upcoming, 1);
    assert.equal(kpis.paid, 1);
  });
});

describe("invoice code", () => {
  it("pads FP-#####", () => {
    assert.equal(formatSupplierInvoiceCode(9101), "FP-09101");
    assert.equal(formatSupplierInvoiceCode(null), null);
  });
});
