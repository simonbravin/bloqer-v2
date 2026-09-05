import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBm25Index, searchBm25 } from "./bm25";

describe("bm25", () => {
  it("ranks relevant docs higher", () => {
    const index = buildBm25Index([
      { id: "1", text: "solicitud de compra materiales cemento" },
      { id: "2", text: "conciliacion bancaria tesoreria" },
      { id: "3", text: "como crear una solicitud de compra en compras" },
    ]);
    const hits = searchBm25(index, "como creo solicitud de compra", { k: 2 });
    assert.ok(hits.length >= 1);
    assert.equal(hits[0]?.id, "3");
  });
});
