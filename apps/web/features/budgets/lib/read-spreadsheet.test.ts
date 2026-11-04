import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { readSpreadsheetFile } from "./read-spreadsheet";

function csv(text: string) {
  return readSpreadsheetFile({ name: "estructura.csv", text: async () => text } as File);
}

test("CSV preserves escaped quotes, separators and multiline descriptions without creating extra WBS rows", async () => {
  assert.deepEqual(await csv('1,"Hormigón ""H-21"", elaborado"\r\n1.1,"Primera línea\nSegunda línea"'), [
    ["1", 'Hormigón "H-21", elaborado'],
    ["1.1", "Primera línea\nSegunda línea"],
  ]);
});

test("CSV delimiter detection ignores quoted commas and reads only structure columns", async () => {
  assert.deepEqual(await csv('\uFEFF"1";"Material, mano de obra, equipos";1234\r\n1.1;Partida;999'), [
    ["1", "Material, mano de obra, equipos"],
    ["1.1", "Partida"],
  ]);
  assert.deepEqual(await csv('\r\n\r\n1;Hierro 3/8"\r\n1.1;Partida'), [["1", 'Hierro 3/8"'], ["1.1", "Partida"]]);
});

test("CSV preserves literal quotes in unquoted descriptions and reports unclosed quoted fields", async () => {
  assert.deepEqual(await csv('1,Hierro de 3/8"\r\n\r\n1.1,Partida'), [["1", 'Hierro de 3/8"'], ["1.1", "Partida"]]);
  await assert.rejects(csv('1,"Campo sin cerrar'), /comillas sin cerrar/);
  assert.deepEqual(await csv(" \r\n\r\n"), []);
});

test("Excel uses formatted code text so 11.10 is not silently imported as 11.1", async () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[11.1, "Partida diez", 999]]);
  sheet.A1 = { t: "n", v: 11.1, z: "0.00" };
  XLSX.utils.book_append_sheet(book, sheet, "EDT");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  const array = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  assert.deepEqual(await readSpreadsheetFile({ name: "estructura.xlsx", arrayBuffer: async () => array } as File), [["11.10", "Partida diez"]]);
});
