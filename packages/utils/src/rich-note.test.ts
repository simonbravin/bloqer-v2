import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRichNoteEmpty,
  normalizeRichNote,
  parseRichNote,
  richNoteToPlainText,
  serializeRichNote,
} from "./rich-note";

describe("parseRichNote", () => {
  it("treats null, blank and empty tags as empty", () => {
    assert.deepEqual(parseRichNote(null), []);
    assert.deepEqual(parseRichNote("   "), []);
    assert.deepEqual(parseRichNote("<p></p><p><br></p>"), []);
  });

  it("keeps legacy plain text and newlines", () => {
    assert.deepEqual(parseRichNote("hola"), [{ type: "p", children: [{ type: "text", text: "hola" }] }]);
    assert.equal(serializeRichNote(parseRichNote("linea 1\nlinea 2")), "<p>linea 1</p><p>linea 2</p>");
  });

  it("does not treat comparisons like <3 as HTML", () => {
    assert.equal(normalizeRichNote("queda <3 días de lluvia"), "<p>queda &lt;3 días de lluvia</p>");
  });

  it("keeps legacy angle-bracket words that are not markup", () => {
    assert.equal(
      normalizeRichNote("costo <bruto> vs neto"),
      "<p>costo &lt;bruto&gt; vs neto</p>",
    );
  });

  it("maps span font-weight bold (Safari/Word) to strong", () => {
    assert.equal(
      normalizeRichNote('<p>Pendiente: <span style="font-weight:bold">hormigón</span></p>'),
      "<p>Pendiente: <strong>hormigón</strong></p>",
    );
  });

  it("parses lists, bold and paragraphs", () => {
    const html = "<p>Hoy</p><ul><li>Excavación</li><li><b>Hormigón</b></li></ul><ol><li>uno</li></ol>";
    const blocks = parseRichNote(html);
    assert.equal(blocks[0]?.type, "p");
    assert.equal(blocks[1]?.type, "ul");
    assert.equal(blocks[2]?.type, "ol");
    if (blocks[1]?.type !== "ul") throw new Error("expected ul");
    assert.equal(blocks[1].items[1]?.[0]?.type, "strong");
  });

  it("strips scripts, images and event attributes", () => {
    const dirty =
      '<p onclick="alert(1)">ok</p><script>alert(1)</script><img src=x onerror=alert(1)><svg/onload=alert(1)>';
    assert.equal(normalizeRichNote(dirty), "<p>ok</p>");
  });

  it("unwraps unknown tags and keeps their text", () => {
    assert.equal(normalizeRichNote("<h1>Título</h1>"), "<p>Título</p>");
    assert.equal(normalizeRichNote("hola <span>cuerpo</span>"), "<p>hola cuerpo</p>");
  });

  it("keeps Chrome-style lists that wrap items in div/p", () => {
    assert.equal(
      normalizeRichNote("<ul><li><div>Excavación</div></li><li><p>Armado</p></li></ul>"),
      "<ul><li>Excavación</li><li>Armado</li></ul>",
    );
  });

  it("does not treat italic as bold", () => {
    assert.equal(normalizeRichNote("<p>a <em>b</em> <i>c</i></p>"), "<p>a b c</p>");
  });

  it("ignores invalid numeric entities instead of throwing", () => {
    assert.equal(normalizeRichNote("<p>ok&#x110000;&#0;</p>"), "<p>ok</p>");
  });
});

describe("normalizeRichNote", () => {
  it("is idempotent and maps empty editor markup to null", () => {
    const once = normalizeRichNote("<p>Avance <strong>OK</strong></p>");
    assert.equal(once, "<p>Avance <strong>OK</strong></p>");
    assert.equal(normalizeRichNote(once), once);
    assert.equal(normalizeRichNote("<div><br></div>"), null);
    assert.equal(isRichNoteEmpty("<p><br></p>"), true);
  });
});

describe("richNoteToPlainText", () => {
  it("renders list markers for PDF / emails", () => {
    const html = "<ul><li>A</li><li>B</li></ul><ol><li>C</li></ol>";
    assert.equal(richNoteToPlainText(html), "• A\n• B\n1. C");
  });
});
