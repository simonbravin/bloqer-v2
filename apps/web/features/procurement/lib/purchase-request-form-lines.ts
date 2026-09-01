import { roundQty } from "@bloqer/utils";

/** Minimal APU shape for form helpers (matches WbsApuOption). */
export type PurchaseRequestApuLine = {
  id: string;
  description: string;
  unit: string;
  productId: string | null;
  quantity: string | null;
  needQty?: string | null;
  orderedQty?: string | null;
  shortfallQty?: string | null;
};

export type PurchaseRequestLineDraft = {
  rowKey: string;
  costAnalysisLineId: string | null;
  description: string;
  quantity: string;
  unit: string;
  productId: string | null;
};

export type PurchaseRequestSubmitLine = {
  wbsNodeId: string;
  lineType: "MATERIAL";
  productId: string | null;
  costAnalysisLineId: string | null;
  description: string;
  unit: string;
  quantity: string;
  sortOrder: number;
};

export type ApuCoverage = {
  totalApuCount: number;
  selectedApuCount: number;
  remainingApuCount: number;
  remainingWithShortfallCount: number;
  allSelected: boolean;
  hasApuCatalog: boolean;
};

export function createPurchaseRequestLineKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pr-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyPurchaseRequestLine(defaultUnit = ""): PurchaseRequestLineDraft {
  return {
    rowKey: createPurchaseRequestLineKey(),
    costAnalysisLineId: null,
    description: "",
    quantity: "1",
    unit: defaultUnit,
    productId: null,
  };
}

export function createPurchaseRequestLineFromInitial(initial: {
  description?: string;
  quantity?: string;
  productId?: string;
  costAnalysisLineId?: string;
  unit?: string;
}): PurchaseRequestLineDraft {
  return {
    rowKey: createPurchaseRequestLineKey(),
    costAnalysisLineId: initial.costAnalysisLineId ?? null,
    description: initial.description ?? "",
    quantity: initial.quantity ?? "1",
    unit: initial.unit ?? "",
    productId: initial.productId ?? null,
  };
}

export function isPositiveQtyString(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  try {
    const s = roundQty(raw);
    return s !== "0.0000" && !s.startsWith("-");
  } catch {
    return false;
  }
}

export function apuPrefillQuantity(apu: PurchaseRequestApuLine): string {
  const raw = apu.shortfallQty ?? apu.quantity;
  if (raw != null && isPositiveQtyString(raw)) return raw;
  return "1";
}

export function apuHasShortfall(apu: PurchaseRequestApuLine): boolean {
  const raw = apu.shortfallQty ?? apu.quantity;
  return isPositiveQtyString(raw);
}

export function selectedApuIds(lines: PurchaseRequestLineDraft[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    if (line.costAnalysisLineId) ids.add(line.costAnalysisLineId);
  }
  return ids;
}

export function computeApuCoverage(
  apuLines: PurchaseRequestApuLine[],
  lines: PurchaseRequestLineDraft[],
): ApuCoverage {
  const totalApuCount = apuLines.length;
  const selected = selectedApuIds(lines);
  const selectedApuCount = apuLines.filter((a) => selected.has(a.id)).length;
  const remaining = apuLines.filter((a) => !selected.has(a.id));
  const remainingWithShortfallCount = remaining.filter(apuHasShortfall).length;
  return {
    totalApuCount,
    selectedApuCount,
    remainingApuCount: remaining.length,
    remainingWithShortfallCount,
    allSelected: totalApuCount > 0 && selectedApuCount >= totalApuCount,
    hasApuCatalog: totalApuCount > 0,
  };
}

export function formatApuCoverageHint(coverage: ApuCoverage): string | null {
  if (!coverage.hasApuCatalog) {
    return "Esta partida no tiene insumos APU de materiales. Cargá descripción a mano.";
  }
  if (coverage.allSelected) {
    return "Están todos los insumos APU de esta partida en la solicitud.";
  }
  if (coverage.remainingApuCount <= 0) return null;
  const rest = coverage.remainingApuCount;
  const withShort = coverage.remainingWithShortfallCount;
  if (withShort > 0) {
    return `Hay ${rest} insumo${rest === 1 ? "" : "s"} APU más en esta partida (${withShort} con faltante).`;
  }
  return `Hay ${rest} insumo${rest === 1 ? "" : "s"} APU más en esta partida.`;
}

export function applyApuToPurchaseRequestLine(
  line: PurchaseRequestLineDraft,
  apu: PurchaseRequestApuLine | null | undefined,
  opts?: { keepQuantity?: boolean },
): PurchaseRequestLineDraft {
  if (!apu) {
    return {
      ...line,
      costAnalysisLineId: null,
      productId: null,
    };
  }
  return {
    ...line,
    costAnalysisLineId: apu.id,
    description: apu.description,
    unit: apu.unit,
    productId: apu.productId,
    quantity: opts?.keepQuantity ? line.quantity : apuPrefillQuantity(apu),
  };
}

export function isBlankPurchaseRequestLine(line: PurchaseRequestLineDraft): boolean {
  return !line.costAnalysisLineId && !line.description.trim();
}

export function buildLinesFromApuShortfalls(
  apuLines: PurchaseRequestApuLine[],
  existingLines: PurchaseRequestLineDraft[],
  defaultUnit = "",
): PurchaseRequestLineDraft[] {
  const used = selectedApuIds(existingLines);
  return apuLines
    .filter((a) => !used.has(a.id) && apuHasShortfall(a))
    .map((apu) =>
      applyApuToPurchaseRequestLine(createEmptyPurchaseRequestLine(defaultUnit), apu),
    );
}

/** Append shortfall APUs; drop blank rows unless the user already started non-blank lines. */
export function mergeApuShortfallLines(
  apuLines: PurchaseRequestApuLine[],
  existingLines: PurchaseRequestLineDraft[],
  defaultUnit = "",
): PurchaseRequestLineDraft[] {
  const added = buildLinesFromApuShortfalls(apuLines, existingLines, defaultUnit);
  if (added.length === 0) return existingLines;
  const nonBlank = existingLines.filter((l) => !isBlankPurchaseRequestLine(l));
  if (nonBlank.length === 0) return added;
  return [...nonBlank, ...added];
}

export function availableApuLinesForRow(
  apuLines: PurchaseRequestApuLine[],
  lines: PurchaseRequestLineDraft[],
  rowKey: string,
): PurchaseRequestApuLine[] {
  const current = lines.find((l) => l.rowKey === rowKey)?.costAnalysisLineId ?? null;
  const usedElsewhere = new Set(
    lines
      .filter((l) => l.rowKey !== rowKey && l.costAnalysisLineId)
      .map((l) => l.costAnalysisLineId!),
  );
  return apuLines.filter((a) => a.id === current || !usedElsewhere.has(a.id));
}

export function validatePurchaseRequestLines(lines: PurchaseRequestLineDraft[]): string | null {
  const substantive = lines.filter((l) => !isBlankPurchaseRequestLine(l));
  if (substantive.length === 0) {
    return "Agregá al menos un material";
  }
  for (const line of substantive) {
    if (!line.description.trim()) {
      return "Completá la descripción en cada línea";
    }
    if (!isPositiveQtyString(line.quantity)) {
      return "La cantidad debe ser mayor a cero en cada línea";
    }
  }
  const apuIds = substantive
    .map((l) => l.costAnalysisLineId)
    .filter((id): id is string => Boolean(id));
  if (new Set(apuIds).size !== apuIds.length) {
    return "No podés repetir el mismo insumo APU en la solicitud";
  }
  return null;
}

export function preparePurchaseRequestLinesForSubmit(
  lines: PurchaseRequestLineDraft[],
  wbsNodeId: string,
  budgetUnit: string,
): { ok: true; lines: PurchaseRequestSubmitLine[] } | { ok: false; error: string } {
  const validationError = validatePurchaseRequestLines(lines);
  if (validationError) return { ok: false, error: validationError };

  const substantive = lines.filter((l) => !isBlankPurchaseRequestLine(l));
  return {
    ok: true,
    lines: substantive.map((line, i) => ({
      wbsNodeId,
      lineType: "MATERIAL" as const,
      productId: line.productId,
      costAnalysisLineId: line.costAnalysisLineId,
      description: line.description.trim(),
      unit: line.unit.trim() || budgetUnit || "un",
      quantity: line.quantity,
      sortOrder: i,
    })),
  };
}

/** Commitment hint text for a line bound to an APU. */
export function apuCommitmentHintText(
  apu: PurchaseRequestApuLine,
  formatQty: (raw: string | null | undefined) => string,
  formatUnit: (unit: string) => string,
): string {
  const u = formatUnit(apu.unit);
  if (apu.needQty != null || apu.orderedQty != null) {
    return `Necesidad ${formatQty(apu.needQty)} · Pedido ${formatQty(apu.orderedQty)} · Faltante ${formatQty(apu.shortfallQty ?? apu.quantity)} ${u}`;
  }
  return `Ref. APU: ${formatQty(apu.quantity)} ${u}`;
}
