import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBankStatementCsv } from "./bank-statement-csv-parser";

describe("parseBankStatementCsv [D-076]", () => {
  it("parses English comma CSV", () => {
    const csv = [
      "date,description,amount,direction,reference",
      "2026-08-01,Transfer cliente,1500.50,CREDIT,TRX-1",
      "2026-08-02,Pago proveedor,800.00,DEBIT,",
    ].join("\n");
    const res = parseBankStatementCsv(csv);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.lines.length, 2);
    assert.deepEqual(res.lines[0], {
      lineDate: "2026-08-01",
      description: "Transfer cliente",
      amount: "1500.50",
      direction: "CREDIT",
      reference: "TRX-1",
      rowNumber: 2,
    });
    assert.equal(res.lines[1]!.direction, "DEBIT");
    assert.equal(res.lines[1]!.reference, null);
  });

  it("parses Spanish semicolon CSV with DD/MM/YYYY and aliases", () => {
    const csv = [
      "fecha;descripcion;monto;direccion;referencia",
      "01/08/2026;Cobro;1.500,50;crédito;ABC",
      "02/08/2026;Pago;800,00;débito;",
    ].join("\n");
    const res = parseBankStatementCsv(csv);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.lines[0]!.lineDate, "2026-08-01");
    assert.equal(res.lines[0]!.amount, "1500.50");
    assert.equal(res.lines[0]!.direction, "CREDIT");
    assert.equal(res.lines[1]!.direction, "DEBIT");
  });

  it("rejects missing headers", () => {
    const res = parseBankStatementCsv("a,b\n1,2");
    assert.equal(res.ok, false);
  });

  it("rejects invalid direction", () => {
    const csv = "date,description,amount,direction\n2026-08-01,x,10,FOO";
    const res = parseBankStatementCsv(csv);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /dirección/i);
  });

  it("rejects impossible calendar dates (DD/MM/YYYY)", () => {
    const csv = "date,description,amount,direction\n32/01/2026,x,10,CREDIT";
    const res = parseBankStatementCsv(csv);
    assert.equal(res.ok, false);
  });
});
