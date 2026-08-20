"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { MaterialsFieldRow } from "@bloqer/services/materials-field";
import {
  parseMaterialsFieldFilter,
  type MaterialsFieldFilterId,
} from "@bloqer/services/materials-field";
import { MaterialFieldDetailSheet } from "./material-field-detail-sheet";
import { MaterialsFieldView } from "./materials-field-view";

export function MaterialsFieldExperience({
  projectId,
  rows,
  canRequest,
  queryMs,
}: {
  projectId: string;
  rows: MaterialsFieldRow[];
  canRequest: boolean;
  queryMs?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fieldParam = searchParams.get("field");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fieldFilter, setFieldFilterState] = useState<MaterialsFieldFilterId>(
    () => parseMaterialsFieldFilter(searchParams.get("field")) ?? "shortfall",
  );

  function replaceParamsShallow(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    window.history.replaceState(window.history.state, "", url);
  }

  function setFieldFilter(next: MaterialsFieldFilterId) {
    setFieldFilterState(next);
    replaceParamsShallow((params) => {
      params.set("field", next);
      params.delete("window");
      params.delete("tab");
    });
  }

  function selectRow(row: MaterialsFieldRow) {
    setSelectedKey(row.rowKey);
    setSheetOpen(true);
    replaceParamsShallow((params) => {
      params.set("rowKey", row.rowKey);
    });
  }

  function closeSheet(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      setSelectedKey(null);
      replaceParamsShallow((params) => {
        params.delete("rowKey");
      });
    }
  }

  const rowKeyParam = searchParams.get("rowKey");
  useEffect(() => {
    if (!rowKeyParam) return;
    const exists = rows.some((r) => r.rowKey === rowKeyParam);
    if (exists) {
      setSelectedKey(rowKeyParam);
      setSheetOpen(true);
      return;
    }
    replaceParamsShallow((params) => {
      params.delete("rowKey");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeyParam, rows]);

  useEffect(() => {
    if (parseMaterialsFieldFilter(fieldParam)) return;
    setFieldFilterState("shortfall");
    replaceParamsShallow((params) => {
      params.set("field", "shortfall");
      params.delete("window");
      params.delete("tab");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldParam]);

  const selectedRow = selectedKey ? (rows.find((r) => r.rowKey === selectedKey) ?? null) : null;

  return (
    <div className="space-y-6">
      <MaterialsFieldView
        projectId={projectId}
        rows={rows}
        canRequest={canRequest}
        fieldParam={fieldFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSelect={selectRow}
        onFilterChange={setFieldFilter}
        queryMs={queryMs}
      />
      <MaterialFieldDetailSheet
        projectId={projectId}
        row={selectedRow}
        canRequest={canRequest}
        open={sheetOpen}
        onOpenChange={closeSheet}
      />
    </div>
  );
}
