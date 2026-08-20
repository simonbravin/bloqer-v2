import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canShowMaterialsFieldPedir,
  compareMaterialsFieldRows,
  filterAndSortMaterialsFieldRows,
  isMaterialsFieldCovered,
  isMaterialsFieldPendingReceipt,
  isMaterialsFieldShortage,
  limitMaterialsFieldRows,
  materialsFieldPedirHref,
  materialsFieldSupplyLabel,
  materialsFieldUrgencyRank,
  parseMaterialsFieldFilter,
  rowInMaterialsFieldWeek,
  summarizeMaterialsFieldKpis,
  uniqueRelatedId,
  type MaterialsFieldRow,
  type MaterialsFieldWindow,
} from "./materials-field";

function row(partial: Partial<MaterialsFieldRow> & Pick<MaterialsFieldRow, "rowKey" | "description">): MaterialsFieldRow {
  return {
    wbsNodeId: "wbs-1",
    wbsCode: "01.01",
    wbsName: "Excavación",
    costAnalysisLineId: "apu-1",
    productId: null,
    productSku: null,
    unit: "m3",
    needQty: "100.0000",
    orderedQty: "0.0000",
    receivedQty: "0.0000",
    consumedQty: "0.0000",
    shortfallQty: "100.0000",
    pendingReceiptQty: "0.0000",
    requiredStart: null,
    requiredEnd: null,
    unscheduled: true,
    relatedPurchaseRequestId: null,
    relatedPurchaseRequestNumber: null,
    relatedPurchaseOrderId: null,
    relatedPurchaseOrderNumber: null,
    ...partial,
  };
}

const WINDOW: MaterialsFieldWindow = {
  todayIso: "2026-08-19",
  weekStart: "2026-08-17",
  weekEnd: "2026-08-23",
  next14Start: "2026-08-19",
  next14End: "2026-08-31",
};

describe("parseMaterialsFieldFilter", () => {
  it("parses canonical ids", () => {
    assert.equal(parseMaterialsFieldFilter("shortfall"), "shortfall");
    assert.equal(parseMaterialsFieldFilter("week"), "week");
    assert.equal(parseMaterialsFieldFilter("next_14_days"), "next_14_days");
    assert.equal(parseMaterialsFieldFilter("ordered"), "ordered");
    assert.equal(parseMaterialsFieldFilter("pending_receipt"), "pending_receipt");
    assert.equal(parseMaterialsFieldFilter("all"), "all");
    assert.equal(parseMaterialsFieldFilter("faltantes"), null);
    assert.equal(parseMaterialsFieldFilter(null), null);
  });
});

describe("Shortage / covered (board shortfall = need − ordered)", () => {
  it("required > available-as-ordered → shortage", () => {
    assert.equal(isMaterialsFieldShortage(row({ rowKey: "a", description: "A", shortfallQty: "80.0000" })), true);
  });
  it("ordered ≥ need → no shortage / covered", () => {
    const covered = row({
      rowKey: "b",
      description: "B",
      needQty: "100.0000",
      orderedQty: "100.0000",
      shortfallQty: "0.0000",
    });
    assert.equal(isMaterialsFieldShortage(covered), false);
    assert.equal(isMaterialsFieldCovered(covered), true);
  });
  it("zero need is not covered", () => {
    assert.equal(
      isMaterialsFieldCovered(
        row({ rowKey: "c", description: "C", needQty: "0.0000", shortfallQty: "0.0000" }),
      ),
      false,
    );
  });
});

describe("Pending supply", () => {
  it("ordered > received → pending receipt", () => {
    assert.equal(
      isMaterialsFieldPendingReceipt(
        row({ rowKey: "p", description: "P", pendingReceiptQty: "12.0000" }),
      ),
      true,
    );
  });
  it("fully received → not pending", () => {
    assert.equal(
      isMaterialsFieldPendingReceipt(
        row({ rowKey: "p2", description: "P2", pendingReceiptQty: "0.0000" }),
      ),
      false,
    );
  });
});

describe("Supply labels", () => {
  it("sin pedir / pedido / parcial / recibido", () => {
    assert.equal(
      materialsFieldSupplyLabel(row({ rowKey: "s", description: "S", orderedQty: "0", receivedQty: "0" })),
      "sin_pedir",
    );
    assert.equal(
      materialsFieldSupplyLabel(row({ rowKey: "s2", description: "S2", orderedQty: "10", receivedQty: "0" })),
      "pedido",
    );
    assert.equal(
      materialsFieldSupplyLabel(row({ rowKey: "s3", description: "S3", orderedQty: "10", receivedQty: "4" })),
      "parcial",
    );
    assert.equal(
      materialsFieldSupplyLabel(row({ rowKey: "s4", description: "S4", orderedQty: "10", receivedQty: "10" })),
      "recibido",
    );
  });
});

describe("Esta semana — Monday–Sunday overlap", () => {
  it("required this week", () => {
    assert.equal(
      rowInMaterialsFieldWeek(
        row({
          rowKey: "w",
          description: "W",
          requiredStart: "2026-08-18",
          requiredEnd: "2026-08-20",
          unscheduled: false,
        }),
        WINDOW,
      ),
      true,
    );
  });
  it("outside week", () => {
    assert.equal(
      rowInMaterialsFieldWeek(
        row({
          rowKey: "w2",
          description: "W2",
          requiredStart: "2026-08-24",
          requiredEnd: "2026-08-26",
          unscheduled: false,
        }),
        WINDOW,
      ),
      false,
    );
  });
  it("unscheduled has no week membership", () => {
    assert.equal(
      rowInMaterialsFieldWeek(row({ rowKey: "w3", description: "W3", unscheduled: true }), WINDOW),
      false,
    );
  });
});

describe("Urgency order", () => {
  it("overdue before today before week before rest", () => {
    const overdue = row({
      rowKey: "o",
      description: "Overdue",
      requiredStart: "2026-08-01",
      requiredEnd: "2026-08-10",
      unscheduled: false,
    });
    const today = row({
      rowKey: "t",
      description: "Today",
      requiredStart: "2026-08-19",
      requiredEnd: "2026-08-21",
      unscheduled: false,
    });
    const week = row({
      rowKey: "k",
      description: "Week",
      requiredStart: "2026-08-22",
      requiredEnd: "2026-08-23",
      unscheduled: false,
    });
    const later = row({
      rowKey: "l",
      description: "Later",
      requiredStart: "2026-09-01",
      requiredEnd: "2026-09-05",
      unscheduled: false,
    });
    assert.equal(materialsFieldUrgencyRank(overdue, WINDOW), 0);
    assert.equal(materialsFieldUrgencyRank(today, WINDOW), 1);
    assert.equal(materialsFieldUrgencyRank(week, WINDOW), 2);
    assert.equal(materialsFieldUrgencyRank(later, WINDOW), 3);
    const sorted = [later, week, overdue, today].sort((a, b) => compareMaterialsFieldRows(a, b, WINDOW));
    assert.deepEqual(
      sorted.map((r) => r.description),
      ["Overdue", "Today", "Week", "Later"],
    );
  });
});

describe("Cap after filter", () => {
  it("filters and sorts before slicing so an overdue shortfall is not dropped", () => {
    const rows: MaterialsFieldRow[] = [];
    for (let i = 0; i < 250; i++) {
      rows.push(
        row({
          rowKey: `ok-${i}`,
          description: `Material ${String(i).padStart(3, "0")}`,
          shortfallQty: "1.0000",
        }),
      );
    }
    rows.push(
      row({
        rowKey: "urgent",
        description: "Faltante urgente",
        shortfallQty: "80.0000",
        requiredStart: "2026-08-01",
        requiredEnd: "2026-08-02",
        unscheduled: false,
      }),
    );
    const shortfall = filterAndSortMaterialsFieldRows(rows, "shortfall", WINDOW);
    const capped = limitMaterialsFieldRows(shortfall, 200);
    assert.equal(capped.visible[0]?.rowKey, "urgent");
    assert.equal(capped.matchedCount, 251);
    assert.equal(capped.truncated, true);
    assert.equal(capped.visible.length, 200);
    assert.equal(
      capped.visible.some((r) => r.rowKey === "ok-249"),
      false,
    );
  });
});

describe("Related SC uniqueness", () => {
  it("0 or >1 ids → null (keep Pedir)", () => {
    assert.equal(uniqueRelatedId([]), null);
    assert.equal(uniqueRelatedId([null]), null);
    assert.equal(uniqueRelatedId(["a", "b"]), null);
  });
  it("exactly one id", () => {
    assert.equal(uniqueRelatedId(["pr-1", "pr-1"]), "pr-1");
  });
});

describe("Pedir CTA", () => {
  it("hidden without permission, without shortfall, or with unique SC", () => {
    const shortage = row({ rowKey: "p", description: "P", shortfallQty: "5" });
    assert.equal(canShowMaterialsFieldPedir(false, shortage), false);
    assert.equal(
      canShowMaterialsFieldPedir(true, row({ rowKey: "c", description: "C", shortfallQty: "0" })),
      false,
    );
    assert.equal(
      canShowMaterialsFieldPedir(true, { ...shortage, relatedPurchaseRequestId: "pr-1" }),
      false,
    );
    assert.equal(canShowMaterialsFieldPedir(true, shortage), true);
  });
  it("builds /nueva prefill href", () => {
    const href = materialsFieldPedirHref("proj", {
      wbsNodeId: "wbs-1",
      description: "Hormigón H21",
      shortfallQty: "80.0000",
      productId: "prod-1",
      costAnalysisLineId: "apu-1",
      unit: "m3",
    });
    assert.match(href, /\/proyectos\/proj\/solicitudes-compra\/nueva\?/);
    assert.match(href, /description=Hormig/);
    assert.match(href, /quantity=80/);
    assert.match(href, /from=materiales/);
    assert.match(href, /costAnalysisLineId=apu-1/);
  });
});

describe("KPIs", () => {
  it("count over full set", () => {
    const kpis = summarizeMaterialsFieldKpis(
      [
        row({ rowKey: "1", description: "A", shortfallQty: "1", orderedQty: "0" }),
        row({
          rowKey: "2",
          description: "B",
          shortfallQty: "0",
          needQty: "10",
          orderedQty: "10",
          pendingReceiptQty: "4",
          requiredStart: "2026-08-18",
          requiredEnd: "2026-08-19",
          unscheduled: false,
        }),
      ],
      WINDOW,
    );
    assert.equal(kpis.shortfall, 1);
    assert.equal(kpis.week, 1);
    assert.equal(kpis.ordered, 1);
    assert.equal(kpis.pendingReceipt, 1);
  });
});

describe("Search", () => {
  it("matches name, WBS code, SKU", () => {
    const rows = [
      row({ rowKey: "1", description: "Hormigón H21", productSku: "H21" }),
      row({ rowKey: "2", description: "Caño PVC", wbsCode: "02.01" }),
    ];
    assert.equal(filterAndSortMaterialsFieldRows(rows, "all", WINDOW, "hormigón").length, 1);
    assert.equal(filterAndSortMaterialsFieldRows(rows, "all", WINDOW, "02.01").length, 1);
    assert.equal(filterAndSortMaterialsFieldRows(rows, "all", WINDOW, "h21").length, 1);
  });
});
