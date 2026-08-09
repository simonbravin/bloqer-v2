/**
 * Bloqer bank statement OFX import ([D-079]).
 *
 * Supports classic OFX 1.x / QFX (SGML tags, not full XML).
 * Reads `<STMTTRN>` blocks: DTPOSTED, TRNAMT, NAME/MEMO, FITID/CHECKNUM.
 * TRNAMT > 0 → CREDIT; TRNAMT < 0 → DEBIT; amount stored as absolute value.
 */

import { roundMoney } from "@bloqer/utils";
import type { ParsedBankStatementCsvLine } from "./bank-statement-csv-parser";
import { BANK_STATEMENT_CSV_MAX_ROWS } from "./bank-statement-csv-parser";

export const BANK_STATEMENT_OFX_MAX_ROWS = BANK_STATEMENT_CSV_MAX_ROWS;

export type ParseBankStatementOfxResult =
  | { ok: true; lines: ParsedBankStatementCsvLine[] }
  | { ok: false; error: string };

function decodeOfxEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/** Extract tag value until next `<` or EOL (OFX SGML style). */
function tagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  if (!m) return null;
  return decodeOfxEntities(m[1]!.trim());
}

function parseOfxDate(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const mo = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function parseTrnAmt(raw: string): {
  amount: string;
  signedDirection: "CREDIT" | "DEBIT" | null;
  hasExplicitSign: boolean;
} | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "+" || cleaned === "-") return null;
  const hasExplicitSign = cleaned.startsWith("-") || cleaned.startsWith("+");
  const negative = cleaned.startsWith("-");
  const absRaw = cleaned.replace(/^[+-]/, "");
  if (!/^\d+(\.\d+)?$/.test(absRaw) || /^0+(\.0+)?$/.test(absRaw)) return null;
  let amount: string;
  try {
    amount = roundMoney(absRaw);
  } catch {
    return null;
  }
  return {
    amount,
    // Explicit sign wins; bare unsigned leaves direction unresolved until TRNTYPE.
    signedDirection: hasExplicitSign ? (negative ? "DEBIT" : "CREDIT") : null,
    hasExplicitSign,
  };
}

function resolveOfxDirection(
  money: NonNullable<ReturnType<typeof parseTrnAmt>>,
  trnTypeRaw: string | null,
): "CREDIT" | "DEBIT" | null {
  const type = (trnTypeRaw ?? "").trim().toUpperCase();
  const typeDirection =
    type === "CREDIT" || type === "DEP" || type === "DIRECTDEP" || type === "INT" || type === "DIV"
      ? ("CREDIT" as const)
      : type === "DEBIT" ||
          type === "PAYMENT" ||
          type === "CHECK" ||
          type === "ATM" ||
          type === "POS" ||
          type === "XFER" ||
          type === "FEE" ||
          type === "SRVCHG"
        ? ("DEBIT" as const)
        : null;

  if (money.signedDirection && typeDirection && money.signedDirection !== typeDirection) {
    return null; // contradictory — reject the row
  }
  return money.signedDirection ?? typeDirection ?? "CREDIT";
}

/**
 * Strip OFX headers before `<OFX>` if present (SGML header / MIME).
 */
function extractOfxBody(text: string): string {
  const idx = text.search(/<OFX[\s>]/i);
  if (idx >= 0) return text.slice(idx);
  // Some banks send bare BANKMSGSRSV1
  if (/<STMTTRN>/i.test(text)) return text;
  return text;
}

export function parseBankStatementOfx(text: string): ParseBankStatementOfxResult {
  if (!text || !text.trim()) {
    return { ok: false, error: "El archivo OFX está vacío" };
  }

  const body = extractOfxBody(text);
  const blockMatches = [
    ...body.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|$)/gi),
  ];
  const blocks = blockMatches.map((m) => m[1] ?? "").filter((b) => /<TRNAMT>/i.test(b));

  if (blocks.length === 0) {
    return {
      ok: false,
      error: "No se encontraron transacciones <STMTTRN> en el archivo OFX/QFX",
    };
  }

  if (blocks.length > BANK_STATEMENT_OFX_MAX_ROWS) {
    return {
      ok: false,
      error: `El archivo supera el máximo de ${BANK_STATEMENT_OFX_MAX_ROWS} transacciones`,
    };
  }

  const lines: ParsedBankStatementCsvLine[] = [];
  let index = 0;
  for (const block of blocks) {
    index += 1;
    const dateRaw = tagValue(block, "DTPOSTED") ?? tagValue(block, "DTUSER");
    if (!dateRaw) {
      return { ok: false, error: `Transacción #${index}: falta DTPOSTED` };
    }
    const lineDate = parseOfxDate(dateRaw);
    if (!lineDate) {
      return { ok: false, error: `Transacción #${index}: fecha inválida (${dateRaw})` };
    }

    const amtRaw = tagValue(block, "TRNAMT");
    if (!amtRaw) {
      return { ok: false, error: `Transacción #${index}: falta TRNAMT` };
    }
    const money = parseTrnAmt(amtRaw);
    if (!money) {
      return { ok: false, error: `Transacción #${index}: monto inválido (${amtRaw})` };
    }
    const direction = resolveOfxDirection(money, tagValue(block, "TRNTYPE"));
    if (!direction) {
      return {
        ok: false,
        error: `Transacción #${index}: TRNTYPE y signo de TRNAMT se contradicen`,
      };
    }

    const name = tagValue(block, "NAME");
    const memo = tagValue(block, "MEMO");
    const description = [name, memo].filter(Boolean).join(" — ").trim() || "Movimiento OFX";
    if (description.length > 500) {
      return {
        ok: false,
        error: `Transacción #${index}: descripción demasiado larga (máx. 500)`,
      };
    }

    const fitid = tagValue(block, "FITID");
    const checknum = tagValue(block, "CHECKNUM");
    const ref = (fitid || checknum || null)?.slice(0, 120) ?? null;

    lines.push({
      lineDate,
      description,
      amount: money.amount,
      direction,
      reference: ref,
      rowNumber: index,
    });
  }

  return { ok: true, lines };
}
