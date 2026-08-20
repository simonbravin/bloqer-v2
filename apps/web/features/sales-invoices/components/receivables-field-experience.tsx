"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReceivablesFieldRow } from "@bloqer/services/receivables-field";
import {
  parseReceivablesFieldFilter,
  type ReceivablesFieldFilterId,
} from "@bloqer/services/receivables-field";
import { ReceivablesFieldView } from "./receivables-field-view";

export function ReceivablesFieldExperience({
  rows,
  queryMs,
}: {
  rows: ReceivablesFieldRow[];
  queryMs?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fieldParam = searchParams.get("field");
  const [searchQuery, setSearchQuery] = useState("");
  const [fieldFilter, setFieldFilterState] = useState<ReceivablesFieldFilterId>(
    () => parseReceivablesFieldFilter(searchParams.get("field")) ?? "pending",
  );

  function replaceParamsShallow(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    window.history.replaceState(window.history.state, "", url);
  }

  function setFieldFilter(next: ReceivablesFieldFilterId) {
    setFieldFilterState(next);
    replaceParamsShallow((params) => {
      params.set("field", next);
    });
  }

  useEffect(() => {
    if (parseReceivablesFieldFilter(fieldParam)) return;
    setFieldFilterState("pending");
    replaceParamsShallow((params) => {
      params.set("field", "pending");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldParam]);

  return (
    <ReceivablesFieldView
      rows={rows}
      fieldParam={fieldFilter}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onFilterChange={setFieldFilter}
      queryMs={queryMs}
    />
  );
}
