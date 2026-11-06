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
    assert.deepEqual(r.declaredCurrencies, []);
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

  it("reports currency declared by bank and card statements containing transactions", () => {
    const bankStatement = SAMPLE.replace("<STMTRS>", "<STMTRS><CURDEF> usd </CURDEF>");
    const cardStatement = `<CCSTMTRS><CURDEF>ARS<BANKTRANLIST><STMTTRN><DTPOSTED>20260808<TRNAMT>20</STMTTRN></BANKTRANLIST></CCSTMTRS>`;
    const otherMessages = `<STMTRS><CURDEF>EUR</STMTRS><XFERPRC><CURDEF>GBP</XFERPRC>`;
    const r = parseBankStatementOfx(bankStatement.replace("</OFX>", `${cardStatement}${otherMessages}</OFX>`));
    assert.ok(r.ok);
    assert.deepEqual(r.declaredCurrencies, ["USD", "ARS"]);
    assert.equal(r.lines.length, 3);
  });

  it("rejects empty / missing transactions", () => {
    assert.equal(parseBankStatementOfx("").ok, false);
    assert.equal(parseBankStatementOfx("<OFX></OFX>").ok, false);
  });

  it("rejects an incomplete movement even when the rest of the statement is valid", () => {
    const incomplete = SAMPLE.replace("<TRNAMT>-250.00", "");
    assert.deepEqual(parseBankStatementOfx(incomplete), {
      ok: false,
      error: "Transacción #2: falta TRNAMT",
    });
  });

  it("rejects a debit that rounds to zero", () => {
    assert.equal(parseBankStatementOfx(SAMPLE.replace("<TRNAMT>-250.00", "<TRNAMT>-0.004")).ok, false);
  });

  it("D-138 accepts explicitly signed transfers in either direction and rejects a bare XFER amount", () => {
    const statement = (amount: string) => `<OFX><BANKTRANLIST><STMTTRN>
      <TRNTYPE>XFER
      <DTPOSTED>20261105
      <TRNAMT>${amount}
      <NAME>Transferencia
      </STMTTRN></BANKTRANLIST></OFX>`;
    for (const [amount, direction] of [["+15.00", "CREDIT"], ["-15.00", "DEBIT"]]) {
      const parsed = parseBankStatementOfx(statement(amount!));
      assert.ok(parsed.ok);
      assert.equal(parsed.lines[0]?.direction, direction);
    }
    const ambiguous = parseBankStatementOfx(statement("15.00"));
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) assert.match(ambiguous.error, /XFER sin signo explícito/);
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
