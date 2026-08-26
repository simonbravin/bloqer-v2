"use client";

import { useEffect, useState } from "react";
import type { CostControlFilters, WbsItemCostDetail } from "@bloqer/services";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getWbsItemCostDetailAction } from "../actions";
import { WbsItemDrilldown } from "./wbs-item-drilldown";

type DrilldownFilters = Pick<CostControlFilters, "budgetId" | "dateFrom" | "dateTo">;

export function WbsItemDrilldownDialog({
  open,
  onOpenChange,
  projectId,
  wbsNodeId,
  wbsCode,
  wbsName,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  wbsNodeId: string | null;
  wbsCode: string;
  wbsName: string;
  filters: DrilldownFilters;
}) {
  const [detail, setDetail] = useState<WbsItemCostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !wbsNodeId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    const nextFilters = {
      budgetId: filters.budgetId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    };

    void getWbsItemCostDetailAction(wbsNodeId, projectId, nextFilters)
      .then((res) => {
        if (cancelled) return;
        if ("ok" in res) {
          setDetail(res.detail);
          setError(null);
        } else {
          setError(res.error);
          setDetail(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("No se pudo cargar el detalle de la partida");
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, wbsNodeId, projectId, filters.budgetId, filters.dateFrom, filters.dateTo]);

  const titleCode = detail?.wbsCode ?? wbsCode;
  const titleName = detail?.wbsName ?? wbsName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 py-3 pr-12">
          <DialogTitle className="text-base">Detalle de la partida</DialogTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-mono">{titleCode || "—"}</span>
            {titleName ? ` — ${titleName}` : ""}
          </p>
          <DialogDescription className="sr-only">
            Detalle de costos, avance y documentos de la partida {titleCode} {titleName}.
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando partida…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : detail ? (
            <WbsItemDrilldown detail={detail} projectId={projectId} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
