"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ScheduleFieldItemDto, ScheduleFieldWorkspaceDto } from "@bloqer/services";
import {
  parseScheduleFieldFilter,
  type ScheduleFieldFilterId,
} from "@bloqer/services/schedule-field";
import { ScheduleFieldItemSheet } from "./schedule-field-item-sheet";
import { ScheduleFieldView } from "./schedule-field-view";

export function ScheduleFieldExperience({
  projectId,
  workspace,
  queryMs,
}: {
  projectId: string;
  workspace: ScheduleFieldWorkspaceDto;
  queryMs?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fieldParam = searchParams.get("field");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fieldFilter, setFieldFilterState] = useState<ScheduleFieldFilterId>(
    () => parseScheduleFieldFilter(searchParams.get("field")) ?? "today",
  );

  function replaceParamsShallow(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    window.history.replaceState(window.history.state, "", url);
  }

  function setFieldFilter(next: ScheduleFieldFilterId) {
    setFieldFilterState(next);
    replaceParamsShallow((params) => {
      params.set("field", next);
      params.delete("view");
      params.delete("status");
      params.delete("delayedOnly");
    });
  }

  function selectItem(item: ScheduleFieldItemDto) {
    setSelectedId(item.id);
    setSheetOpen(true);
    replaceParamsShallow((params) => {
      params.set("itemId", item.id);
      params.delete("dialogTab");
    });
  }

  function closeSheet(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      setSelectedId(null);
      replaceParamsShallow((params) => {
        params.delete("itemId");
        params.delete("dialogTab");
      });
    }
  }

  const itemIdParam = searchParams.get("itemId");
  useEffect(() => {
    if (!itemIdParam) return;
    const exists = workspace.items.some((i) => i.id === itemIdParam);
    if (exists) {
      setSelectedId(itemIdParam);
      setSheetOpen(true);
      return;
    }
    replaceParamsShallow((params) => {
      params.delete("itemId");
      params.delete("dialogTab");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdParam, workspace.items]);

  useEffect(() => {
    if (parseScheduleFieldFilter(fieldParam)) return;
    setFieldFilterState("today");
    replaceParamsShallow((params) => {
      params.set("field", "today");
      params.delete("view");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldParam]);

  const selectedItem = selectedId
    ? workspace.items.find((i) => i.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <ScheduleFieldView
        workspace={workspace}
        fieldParam={fieldFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSelect={selectItem}
        onFilterChange={setFieldFilter}
        queryMs={queryMs}
      />
      <ScheduleFieldItemSheet
        projectId={projectId}
        canEdit={workspace.canEdit}
        item={selectedItem}
        open={sheetOpen}
        onOpenChange={closeSheet}
      />
    </div>
  );
}
