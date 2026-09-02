import { addDecimal, DISPLAY_DECIMALS, divideDecimal, multiplyDecimal, roundQty } from "@bloqer/utils";

export type JobsiteLogProgressDraft = {
  wbsNodeId: string;
  description: string;
  quantityCompleted: string;
  physicalPct: string;
  notes: string;
};

export type JobsiteLogMaterialDraft = {
  productId: string;
  warehouseId: string;
  description: string;
  quantity: string;
  notes: string;
};

export const JOBSITE_PROGRESS_NONE = "__none__";
export const JOBSITE_QTY_RE = /^\d+(\.\d+)?$/;

export function isBlankProgressLine(p: JobsiteLogProgressDraft): boolean {
  return (
    p.wbsNodeId === JOBSITE_PROGRESS_NONE &&
    !p.description.trim() &&
    !p.quantityCompleted.trim() &&
    !p.physicalPct.trim() &&
    !p.notes.trim()
  );
}

export function isValidProgressLine(p: JobsiteLogProgressDraft): boolean {
  return p.wbsNodeId !== JOBSITE_PROGRESS_NONE && JOBSITE_QTY_RE.test(p.quantityCompleted.trim());
}

/** Qty implied by budget qty × % del día / 100 (operational evidence). */
export function suggestedQuantityFromPct(
  budgetQty: string | undefined,
  physicalPct: string,
): string {
  const qty = budgetQty?.trim() ?? "";
  const pct = physicalPct.trim();
  if (!JOBSITE_QTY_RE.test(qty) || !JOBSITE_QTY_RE.test(pct)) return "";
  try {
    return roundQty(divideDecimal(multiplyDecimal(qty, pct), "100"));
  } catch {
    return "";
  }
}

export function fillProgressQuantity(
  line: JobsiteLogProgressDraft,
  budgetQty: string | undefined,
): JobsiteLogProgressDraft {
  if (JOBSITE_QTY_RE.test(line.quantityCompleted.trim())) return line;
  const suggested = suggestedQuantityFromPct(budgetQty, line.physicalPct);
  if (!suggested) return line;
  return { ...line, quantityCompleted: suggested };
}

/** % implied by qty / budget when the user typed cantidad and left % empty. */
export function fillProgressPhysicalPct(
  line: JobsiteLogProgressDraft,
  budgetQty: string | undefined,
): JobsiteLogProgressDraft {
  if (JOBSITE_QTY_RE.test(line.physicalPct.trim())) return line;
  const suggested = suggestedPctFromQty(budgetQty, line.quantityCompleted);
  if (!suggested) return line;
  return { ...line, physicalPct: suggested };
}

/** Qty from % first, then % from qty — never overwrite a field the user already typed. */
export function fillProgressDerivedFields(
  line: JobsiteLogProgressDraft,
  budgetQty: string | undefined,
): JobsiteLogProgressDraft {
  return fillProgressPhysicalPct(fillProgressQuantity(line, budgetQty), budgetQty);
}

/** Add a draft % onto a running total; skip blank/invalid tokens (form live input). */
export function addPhysicalPctSafe(base: string, increment: string): string {
  const inc = increment.trim();
  if (!inc || !JOBSITE_QTY_RE.test(inc)) return base;
  try {
    return addDecimal(base, inc);
  } catch {
    return base;
  }
}

export function cumulativePhysicalPctFromDrafts(
  approvedPct: string,
  draftPcts: string[],
): string {
  let total = approvedPct;
  for (const pct of draftPcts) total = addPhysicalPctSafe(total, pct);
  return total;
}

/** % del día implied by qty / budgetQty × 100 (2 dp, same as the form display). */
export function suggestedPctFromQty(
  budgetQty: string | undefined,
  quantityCompleted: string,
): string {
  const qty = quantityCompleted.trim();
  const base = budgetQty?.trim() ?? "";
  if (!JOBSITE_QTY_RE.test(qty) || !JOBSITE_QTY_RE.test(base)) return "";
  try {
    return divideDecimal(multiplyDecimal(qty, "100"), base, DISPLAY_DECIMALS);
  } catch {
    return "";
  }
}

/** Keep qty aligned when the user edits % del día ([D-045] / EDT % avance libro). */
export function applyProgressPctChange(
  line: JobsiteLogProgressDraft,
  budgetQty: string | undefined,
): JobsiteLogProgressDraft {
  if (!line.physicalPct.trim()) return line;
  const suggested = suggestedQuantityFromPct(budgetQty, line.physicalPct);
  if (!suggested) return line;
  return { ...line, quantityCompleted: suggested };
}

/** Keep % aligned when the user edits cantidad. */
export function applyProgressQtyChange(
  line: JobsiteLogProgressDraft,
  budgetQty: string | undefined,
): JobsiteLogProgressDraft {
  if (!line.quantityCompleted.trim()) return line;
  const suggested = suggestedPctFromQty(budgetQty, line.quantityCompleted);
  if (!suggested) return line;
  return { ...line, physicalPct: suggested };
}

/** On partida change: refresh % and qty so the previous row cannot keep the old cantidad. */
export function applyProgressWbsSelection(
  row: JobsiteLogProgressDraft,
  wbs: { id: string; code: string; name: string; budgetQty?: string } | undefined,
  remainingPct: string,
): JobsiteLogProgressDraft {
  const next: JobsiteLogProgressDraft = {
    ...row,
    wbsNodeId: wbs?.id ?? JOBSITE_PROGRESS_NONE,
    physicalPct: remainingPct,
    quantityCompleted: suggestedQuantityFromPct(wbs?.budgetQty, remainingPct),
  };
  if (wbs && !row.description.trim()) {
    next.description = `${wbs.code} — ${wbs.name}`;
  }
  return next;
}

export function progressLinesSubmitError(lines: JobsiteLogProgressDraft[]): string | null {
  const started = lines.filter((p) => !isBlankProgressLine(p));
  if (started.some((p) => !isValidProgressLine(p))) {
    return "Cada fila de avance necesita partida EDT y cantidad. El % del día no alcanza para guardar la línea.";
  }
  return null;
}

export type JobsiteLogProgressPayloadLine = {
  wbsNodeId: string;
  description?: string;
  quantityCompleted: string;
  physicalPct?: string;
  notes?: string;
  sortOrder: number;
};

/** Fill suggested qty, reject incomplete rows, serialize the JSON the server action expects. */
export function prepareProgressLinesForSubmit(
  lines: JobsiteLogProgressDraft[],
  wbsOptions: { id: string; budgetQty?: string }[],
): { error: string } | { filled: JobsiteLogProgressDraft[]; payload: JobsiteLogProgressPayloadLine[] } {
  const filled = lines.map((p) => {
    const wbs = wbsOptions.find((w) => w.id === p.wbsNodeId);
    return fillProgressDerivedFields(p, wbs?.budgetQty);
  });
  const error = progressLinesSubmitError(filled);
  if (error) return { error };
  return {
    filled,
    payload: filled.filter(isValidProgressLine).map((p, i) => ({
      wbsNodeId: p.wbsNodeId,
      description: p.description || undefined,
      quantityCompleted: p.quantityCompleted,
      physicalPct: p.physicalPct || undefined,
      notes: p.notes || undefined,
      sortOrder: i,
    })),
  };
}

export function isBlankMaterialLine(m: JobsiteLogMaterialDraft): boolean {
  return (
    m.productId === JOBSITE_PROGRESS_NONE &&
    m.warehouseId === JOBSITE_PROGRESS_NONE &&
    !m.description.trim() &&
    !m.quantity.trim() &&
    !m.notes.trim()
  );
}

export function isValidMaterialLine(m: JobsiteLogMaterialDraft): boolean {
  return Boolean(m.description.trim()) && JOBSITE_QTY_RE.test(m.quantity.trim());
}

export type JobsiteLogMaterialPayloadLine = {
  productId?: string;
  warehouseId?: string;
  description: string;
  quantity: string;
  notes?: string;
  sortOrder: number;
};

export function prepareMaterialLinesForSubmit(
  lines: JobsiteLogMaterialDraft[],
): { error: string } | { payload: JobsiteLogMaterialPayloadLine[] } {
  const started = lines.filter((m) => !isBlankMaterialLine(m));
  if (started.some((m) => !isValidMaterialLine(m))) {
    return { error: "Cada fila de materiales necesita descripción y cantidad." };
  }
  return {
    payload: started.map((m, i) => ({
      productId: m.productId === JOBSITE_PROGRESS_NONE ? undefined : m.productId,
      warehouseId: m.warehouseId === JOBSITE_PROGRESS_NONE ? undefined : m.warehouseId,
      description: m.description,
      quantity: m.quantity,
      notes: m.notes || undefined,
      sortOrder: i,
    })),
  };
}
