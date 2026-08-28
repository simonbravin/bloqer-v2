/** EDT column presets — persisted in localStorage (D-098). */

export type EdtColumnId =
  | "budgetCost"
  | "budgetSale"
  | "certified"
  | "committed"
  | "received"
  | "accrued"
  | "paid"
  | "consumed"
  | "openCommitted"
  | "exposure"
  | "variance"
  | "physicalProgress"
  | "qtyBudgeted"
  | "qtyCommitted"
  | "qtyReceived"
  | "qtyConsumed"
  | "pctPurchased"
  | "pctPhysical"
  | "pctEconomic"
  | "pctExposure";

export type EdtPresetId = "financial" | "compact" | "quantities" | "progress" | "custom";

export const EDT_COLUMN_LABELS: Record<EdtColumnId, string> = {
  budgetCost: "Pres. costo",
  budgetSale: "Pres. venta",
  certified: "Cert. aprobado",
  committed: "Comprometido",
  received: "Recibido",
  accrued: "Devengado",
  paid: "Pagado",
  consumed: "Consumido",
  openCommitted: "Comp. abierto",
  exposure: "Exposición esp.",
  variance: "Variación",
  physicalProgress: "Avance físico",
  qtyBudgeted: "Cant. presup.",
  qtyCommitted: "Cant. compr.",
  qtyReceived: "Cant. recibida",
  qtyConsumed: "Cant. consumida",
  pctPurchased: "% compra",
  pctPhysical: "% físico",
  pctEconomic: "% económico",
  pctExposure: "% exposición",
};

export const EDT_PRESET_LABELS: Record<EdtPresetId, string> = {
  financial: "Financiero",
  compact: "Compacto",
  quantities: "Cantidades",
  progress: "% Avance",
  custom: "Personalizado",
};

const FINANCIAL_COLS: EdtColumnId[] = [
  "budgetCost",
  "budgetSale",
  "certified",
  "committed",
  "received",
  "accrued",
  "paid",
  "consumed",
  "openCommitted",
  "exposure",
  "variance",
  "physicalProgress",
];

const COMPACT_COLS: EdtColumnId[] = ["budgetCost", "exposure", "variance", "pctExposure"];

const QUANTITIES_COLS: EdtColumnId[] = [
  "qtyBudgeted",
  "qtyCommitted",
  "qtyReceived",
  "qtyConsumed",
  "physicalProgress",
  "pctPhysical",
];

const PROGRESS_COLS: EdtColumnId[] = [
  "budgetCost",
  "committed",
  "accrued",
  "exposure",
  "pctPurchased",
  "pctPhysical",
  "pctEconomic",
  "pctExposure",
];

export const EDT_PRESET_COLUMNS: Record<Exclude<EdtPresetId, "custom">, EdtColumnId[]> = {
  financial: FINANCIAL_COLS,
  compact: COMPACT_COLS,
  quantities: QUANTITIES_COLS,
  progress: PROGRESS_COLS,
};

export const ALL_EDT_COLUMNS: EdtColumnId[] = Object.keys(EDT_COLUMN_LABELS) as EdtColumnId[];

export type EdtPresetState = {
  preset: EdtPresetId;
  customColumns: EdtColumnId[];
};

export function edtPresetStorageKey(projectId: string): string {
  return `bloqer:edt:preset:${projectId}`;
}

export function columnsForPreset(state: EdtPresetState): EdtColumnId[] {
  if (state.preset === "custom") {
    return state.customColumns.length > 0 ? state.customColumns : FINANCIAL_COLS;
  }
  return EDT_PRESET_COLUMNS[state.preset];
}

export function defaultEdtPresetState(): EdtPresetState {
  return { preset: "financial", customColumns: [...FINANCIAL_COLS] };
}

export function readEdtPresetState(projectId: string): EdtPresetState {
  try {
    const raw = localStorage.getItem(edtPresetStorageKey(projectId));
    if (!raw) return defaultEdtPresetState();
    const parsed = JSON.parse(raw) as Partial<EdtPresetState>;
    const preset = parsed.preset;
    if (
      preset !== "financial" &&
      preset !== "compact" &&
      preset !== "quantities" &&
      preset !== "progress" &&
      preset !== "custom"
    ) {
      return defaultEdtPresetState();
    }
    const customColumns = Array.isArray(parsed.customColumns)
      ? parsed.customColumns.filter((c): c is EdtColumnId =>
          ALL_EDT_COLUMNS.includes(c as EdtColumnId),
        )
      : [...FINANCIAL_COLS];
    return { preset, customColumns };
  } catch {
    return defaultEdtPresetState();
  }
}

export function persistEdtPresetState(projectId: string, state: EdtPresetState): void {
  try {
    localStorage.setItem(edtPresetStorageKey(projectId), JSON.stringify(state));
  } catch {
    /* private mode */
  }
}
