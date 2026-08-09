import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBankStatementOfx } from "./bank-statement-ofx-parser";

const SAMPLE = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805
<TRNAMT>1500.50
<FITID>ABC123
<NAME>Transferencia cliente
<MEMO>Cobro factura
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260806
<TRNAMT>-250.00
<FITID>XYZ9
<NAME>Pago proveedor
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("parseBankStatementOfx (D-079)", () => {
  it("parses STMTTRN credit and debit amounts", () => {
    const r = parseBankStatementOfx(SAMPLE);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.lines.length, 2);
    assert.deepEqual(r.lines[0], {
      lineDate: "2026-08-05",
      description: "Transferencia cliente — Cobro factura",
      amount: "1500.50",
      direction: "CREDIT",
      reference: "ABC123",
      rowNumber: 1,
    });
    assert.equal(r.lines[1]!.direction, "DEBIT");
    assert.equal(r.lines[1]!.amount, "250.00");
    assert.equal(r.lines[1]!.lineDate, "2026-08-06");
  });

  it("rejects empty / missing transactions", () => {
    assert.equal(parseBankStatementOfx("").ok, false);
    assert.equal(parseBankStatementOfx("<OFX></OFX>").ok, false);
  });

  it("uses TRNTYPE when TRNAMT is unsigned", () => {
    const r = parseBankStatementOfx(`
<OFX><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260807
<TRNAMT>100.00
<FITID>U1
<NAME>Pago
</STMTTRN>
</BANKTRANLIST></OFX>
`);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.lines[0]!.direction, "DEBIT");
    assert.equal(r.lines[0]!.amount, "100.00");
  });

  it("rejects when TRNTYPE contradicts signed TRNAMT", () => {
    const r = parseBankStatementOfx(`
<OFX><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260807
<TRNAMT>+100.00
<FITID>U2
<NAME>Pago
</STMTTRN>
</BANKTRANLIST></OFX>
`);
    assert.equal(r.ok, false);
  });
});
