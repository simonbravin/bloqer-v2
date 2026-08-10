/**
 * Pure journal line helpers — must stay free of "use client"
 * so Server Components can seed forms safely.
 */

export interface LineEditorRow {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  currency: string;
  description: string;
}

export interface AccountPick {
  id: string;
  code: string;
  name: string;
}

export function createEmptyJournalLine(currency = "ARS"): LineEditorRow {
  return {
    key: crypto.randomUUID(),
    accountId: "",
    debit: "0",
    credit: "0",
    currency,
    description: "",
  };
}

export function initialJournalLines(): LineEditorRow[] {
  return [createEmptyJournalLine(), createEmptyJournalLine()];
}

export function linesFromJournalEntry(
  lines: {
    accountId: string;
    debit: string;
    credit: string;
    currency: string;
    description: string | null;
  }[],
): LineEditorRow[] {
  return lines.map((l) => ({
    key: crypto.randomUUID(),
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    currency: l.currency,
    description: l.description ?? "",
  }));
}
