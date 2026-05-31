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

export type WbsViewMode = "breakdown" | "totals";

export function wbsViewModeStorageKey(budgetId: string): string {
  return `wbs-view-mode-${budgetId}`;
}

function readStoredViewMode(storageKey: string): WbsViewMode {
  if (typeof window === "undefined") return "breakdown";
  const stored = sessionStorage.getItem(storageKey);
  return stored === "totals" ? "totals" : "breakdown";
}

type BudgetWbsViewContextValue = {
  viewMode: WbsViewMode;
  setViewMode: (mode: WbsViewMode) => void;
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
  const [viewMode, setViewModeState] = useState<WbsViewMode>(() => readStoredViewMode(storageKey));

  useEffect(() => {
    setViewModeState(readStoredViewMode(storageKey));
  }, [storageKey]);

  const setViewMode = useCallback(
    (mode: WbsViewMode) => {
      setViewModeState(mode);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(storageKey, mode);
      }
    },
    [storageKey],
  );

  const value = useMemo(() => ({ viewMode, setViewMode }), [viewMode, setViewMode]);

  return <BudgetWbsViewContext.Provider value={value}>{children}</BudgetWbsViewContext.Provider>;
}

export function useBudgetWbsViewMode(): BudgetWbsViewContextValue {
  const ctx = useContext(BudgetWbsViewContext);
  if (!ctx) {
    throw new Error("useBudgetWbsViewMode must be used within BudgetWbsViewProvider");
  }
  return ctx;
}
