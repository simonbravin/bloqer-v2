"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** [D-058] + [D-060] EDT table view axes. Totals always on; unitario is additive. */
export type WbsViewBase = "cost" | "sale";
export type WbsViewDetail = "compact" | "breakdown";

export type WbsViewMode = {
  base: WbsViewBase;
  /** When true, unit columns appear alongside always-visible totals. */
  showUnit: boolean;
  detail: WbsViewDetail;
  /** Independent toggle — % of project total (cost or sale base). */
  showIncidence: boolean;
};

const DEFAULT_VIEW: WbsViewMode = {
  base: "cost",
  showUnit: false,
  detail: "breakdown",
  showIncidence: false,
};

export function wbsViewModeStorageKey(budgetId: string): string {
  return `wbs-view-mode-v4-${budgetId}`;
}

/** Previous key — read once to migrate preferences after Unitario became additive. */
function wbsViewModeLegacyStorageKey(budgetId: string): string {
  return `wbs-view-mode-v3-${budgetId}`;
}

function parseStored(raw: string | null): WbsViewMode {
  if (!raw) return DEFAULT_VIEW;
  // Legacy v1: "breakdown" | "totals"
  if (raw === "breakdown") {
    return { ...DEFAULT_VIEW, detail: "breakdown" };
  }
  if (raw === "totals") {
    return { ...DEFAULT_VIEW, detail: "compact" };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WbsViewMode> & { scale?: string };
    const showUnit =
      parsed.showUnit === true ||
      parsed.scale === "unit";
    return {
      base: parsed.base === "sale" ? "sale" : "cost",
      showUnit,
      detail: parsed.detail === "compact" ? "compact" : "breakdown",
      showIncidence: parsed.showIncidence === true,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

function normalizeMode(mode: WbsViewMode): WbsViewMode {
  return {
    ...mode,
    // Desglose solo aplica a costo ([D-058])
    detail: mode.base === "sale" ? "compact" : mode.detail,
    showUnit: Boolean(mode.showUnit),
    showIncidence: Boolean(mode.showIncidence),
  };
}

function readStoredViewMode(budgetId: string, storageKey: string): WbsViewMode {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const legacyKey = wbsViewModeLegacyStorageKey(budgetId);
  const current = sessionStorage.getItem(storageKey);
  const legacy = sessionStorage.getItem(legacyKey);
  // Prefer v3 when both exist (avoids discarding richer prefs behind a stale DEFAULT v4).
  const mode = normalizeMode(parseStored(legacy ?? current));
  if (legacy != null) {
    sessionStorage.setItem(storageKey, JSON.stringify(mode));
    sessionStorage.removeItem(legacyKey);
  }
  return mode;
}

type BudgetWbsViewContextValue = {
  viewMode: WbsViewMode;
  setViewMode: (mode: WbsViewMode) => void;
  patchViewMode: (patch: Partial<WbsViewMode>) => void;
};

const BudgetWbsViewContext = createContext<BudgetWbsViewContextValue | null>(null);

export function BudgetWbsViewProvider({
  budgetId,
  children,
}: {
  budgetId: string;
  children: ReactNode;
}) {
  const storageKey = useMemo(() => wbsViewModeStorageKey(budgetId), [budgetId]);
  // SSR-safe default; hydrate from sessionStorage after mount (avoids mismatch).
  const [viewMode, setViewModeState] = useState<WbsViewMode>(DEFAULT_VIEW);

  useEffect(() => {
    setViewModeState(readStoredViewMode(budgetId, storageKey));
  }, [budgetId, storageKey]);

  const setViewMode = useCallback(
    (mode: WbsViewMode) => {
      const next = normalizeMode(mode);
      setViewModeState(next);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      }
    },
    [storageKey],
  );

  const patchViewMode = useCallback(
    (patch: Partial<WbsViewMode>) => {
      setViewModeState((prev) => {
        const next = normalizeMode({ ...prev, ...patch });
        if (typeof window !== "undefined") {
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        }
        return next;
      });
    },
    [storageKey],
  );

  const value = useMemo(
    () => ({ viewMode, setViewMode, patchViewMode }),
    [viewMode, setViewMode, patchViewMode],
  );

  return <BudgetWbsViewContext.Provider value={value}>{children}</BudgetWbsViewContext.Provider>;
}

export function useBudgetWbsViewMode(): BudgetWbsViewContextValue {
  const ctx = useContext(BudgetWbsViewContext);
  if (!ctx) {
    throw new Error("useBudgetWbsViewMode must be used within BudgetWbsViewProvider");
  }
  return ctx;
}
