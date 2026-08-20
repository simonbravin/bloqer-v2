import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareReceivablesFieldRows,
  filterAndSortReceivablesFieldRows,
  formatSalesInvoiceCode,
  isReceivablesFieldOpen,
  limitReceivablesFieldRows,
  matchesReceivablesFieldSearch,
  parseReceivablesFieldFilter,
  RECEIVABLES_FIELD_LIST_LIMIT,
  receivableFieldDetailHref,
  receivablesFieldTodayIso,
  receivablesFieldUrgency,
  summarizeReceivablesFieldKpis,
  type ReceivablesFieldRow,
} from "./receivables-field";

function row(
  partial: Partial<ReceivablesFieldRow> & Pick<ReceivablesFieldRow, "id" | "clientName">,
): ReceivablesFieldRow {
  return {
    salesInvoiceId: `inv-${partial.id}`,
    salesInvoiceCode: "FAC-09201",
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

describe("parseReceivablesFieldFilter", () => {
  it("parses canonical ids", () => {
    assert.equal(parseReceivablesFieldFilter("pending"), "pending");
    assert.equal(parseReceivablesFieldFilter("overdue"), "overdue");
    assert.equal(parseReceivablesFieldFilter("upcoming"), "upcoming");
    assert.equal(parseReceivablesFieldFilter("paid"), "paid");
    assert.equal(parseReceivablesFieldFilter("vencidas"), null);
    assert.equal(parseReceivablesFieldFilter(null), null);
  });
});

describe("receivablesFieldTodayIso", () => {
  it("uses product TZ calendar day (ART)", () => {
    assert.equal(receivablesFieldTodayIso(new Date("2026-08-20T02:30:00.000Z")), "2026-08-19");
    assert.equal(receivablesFieldTodayIso(new Date("2026-08-20T03:00:00.000Z")), "2026-08-20");
    assert.equal(receivablesFieldTodayIso(new Date("2026-08-20T23:30:00.000Z")), "2026-08-20");
  });
});

describe("urgency (UTC due date, due today is not overdue)", () => {
  it("overdue when due < today and open", () => {
    assert.equal(
      receivablesFieldUrgency(row({ id: "a", clientName: "A", dueDateIso: "2026-08-19" }), TODAY),
      "overdue",
    );
  });
  it("due today", () => {
    assert.equal(
      receivablesFieldUrgency(row({ id: "b", clientName: "B", dueDateIso: TODAY }), TODAY),
      "due_today",
    );
  });
  it("upcoming when due > today", () => {
    assert.equal(
      receivablesFieldUrgency(row({ id: "c", clientName: "C", dueDateIso: "2026-08-27" }), TODAY),
      "upcoming",
    );
  });
  it("paid/cobrada when no open balance", () => {
    assert.equal(
      receivablesFieldUrgency(
        row({
          id: "d",
          clientName: "D",
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
      receivablesFieldUrgency(row({ id: "e", clientName: "E", status: "CANCELLED" }), TODAY),
      "cancelled",
    );
  });
});

describe("open balance", () => {
  it("cent remains open; sub-cent does not", () => {
    assert.equal(isReceivablesFieldOpen(row({ id: "c", clientName: "C", balanceDue: "0.01" })), true);
    assert.equal(
      isReceivablesFieldOpen(row({ id: "d", clientName: "D", balanceDue: "0.009", status: "OPEN" })),
      false,
    );
  });
  it("PAID / CANCELLED are not open", () => {
    assert.equal(
      isReceivablesFieldOpen(row({ id: "p", clientName: "P", status: "PAID", balanceDue: "10.00" })),
      false,
    );
    assert.equal(
      isReceivablesFieldOpen(row({ id: "x", clientName: "X", status: "CANCELLED", balanceDue: "10.00" })),
      false,
    );
  });
});

describe("filters / search / sort", () => {
  const rows: ReceivablesFieldRow[] = [
    row({ id: "over", clientName: "Aceros", dueDateIso: "2026-08-10", salesInvoiceCode: "FAC-09201" }),
    row({ id: "today", clientName: "Cemento", dueDateIso: TODAY, salesInvoiceCode: "FAC-09202" }),
    row({
      id: "soon",
      clientName: "Pinturas",
      dueDateIso: "2026-08-28",
      balanceDue: "50000.00",
      salesInvoiceCode: "FAC-09203",
    }),
    row({
      id: "paid",
      clientName: "Vidrios",
      status: "PAID",
      paidAmount: "100000.00",
      balanceDue: "0.00",
      dueDateIso: "2026-07-01",
      salesInvoiceCode: "FAC-09204",
    }),
  ];

  it("pending default excludes paid", () => {
    const pending = filterAndSortReceivablesFieldRows(rows, "pending", TODAY, "");
    assert.deepEqual(
      pending.map((r) => r.id),
      ["over", "today", "soon"],
    );
  });

  it("overdue filter", () => {
    const overdue = filterAndSortReceivablesFieldRows(rows, "overdue", TODAY, "");
    assert.deepEqual(
      overdue.map((r) => r.id),
      ["over"],
    );
  });

  it("upcoming includes due today and future", () => {
    const upcoming = filterAndSortReceivablesFieldRows(rows, "upcoming", TODAY, "");
    assert.deepEqual(
      upcoming.map((r) => r.id),
      ["today", "soon"],
    );
  });

  it("paid/cobrada filter", () => {
    const paid = filterAndSortReceivablesFieldRows(rows, "paid", TODAY, "");
    assert.deepEqual(
      paid.map((r) => r.id),
      ["paid"],
    );
  });

  it("search client / invoice", () => {
    assert.equal(matchesReceivablesFieldSearch(rows[0]!, "aceros"), true);
    assert.equal(matchesReceivablesFieldSearch(rows[0]!, "09201"), true);
    assert.equal(matchesReceivablesFieldSearch(rows[0]!, "vidrio"), false);
    const found = filterAndSortReceivablesFieldRows(rows, "pending", TODAY, "Pinturas");
    assert.deepEqual(
      found.map((r) => r.id),
      ["soon"],
    );
  });

  it("sorts overdue first, not alpha", () => {
    const a = row({ id: "z", clientName: "AAA", dueDateIso: "2026-08-30" });
    const b = row({ id: "y", clientName: "ZZZ", dueDateIso: "2026-08-01" });
    assert.ok(compareReceivablesFieldRows(b, a, TODAY) < 0);
  });
});

describe("cap after filter", () => {
  it("slices after filter so a later overdue still appears in Vencidas", () => {
    const many = Array.from({ length: RECEIVABLES_FIELD_LIST_LIMIT + 5 }, (_, i) =>
      row({
        id: `n${i}`,
        clientName: `Cli ${String(i).padStart(3, "0")}`,
        dueDateIso: "2026-09-01",
        status: "OPEN",
      }),
    );
    const overdue = row({
      id: "late-overdue",
      clientName: "Vencida al final",
      dueDateIso: "2026-08-01",
    });
    const all = [...many, overdue];
    const pending = filterAndSortReceivablesFieldRows(all, "pending", TODAY, "");
    const { visible, truncated, matchedCount } = limitReceivablesFieldRows(pending);
    assert.equal(truncated, true);
    assert.equal(matchedCount, RECEIVABLES_FIELD_LIST_LIMIT + 6);
    assert.equal(visible.length, RECEIVABLES_FIELD_LIST_LIMIT);
    assert.equal(visible[0]?.id, "late-overdue");

    const onlyOverdue = filterAndSortReceivablesFieldRows(all, "overdue", TODAY, "");
    assert.equal(onlyOverdue[0]?.id, "late-overdue");
    assert.equal(limitReceivablesFieldRows(onlyOverdue).truncated, false);
  });
});

describe("kpis", () => {
  it("counts over the full loaded set", () => {
    const rows = [
      row({ id: "o", clientName: "O", dueDateIso: "2026-08-01" }),
      row({ id: "u", clientName: "U", dueDateIso: "2026-08-28" }),
      row({
        id: "p",
        clientName: "P",
        status: "PAID",
        paidAmount: "1.00",
        balanceDue: "0.00",
      }),
    ];
    const kpis = summarizeReceivablesFieldKpis(rows, TODAY);
    assert.equal(kpis.pending, 2);
    assert.equal(kpis.overdue, 1);
    assert.equal(kpis.upcoming, 1);
    assert.equal(kpis.paid, 1);
  });
});

describe("invoice code and href", () => {
  it("pads FAC-#####", () => {
    assert.equal(formatSalesInvoiceCode(9201), "FAC-09201");
    assert.equal(formatSalesInvoiceCode(null), null);
  });
  it("routes project CxC to the project workspace", () => {
    assert.equal(
      receivableFieldDetailHref({ id: "r1", projectId: "proj-1" }),
      "/proyectos/proj-1/cuentas-por-cobrar/r1",
    );
    assert.equal(
      receivableFieldDetailHref({ id: "r2", projectId: null }),
      "/finanzas/cuentas-por-cobrar/r2",
    );
  });
});
