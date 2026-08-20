"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PayablesFieldRow } from "@bloqer/services/payables-field";
import {
  parsePayablesFieldFilter,
  type PayablesFieldFilterId,
} from "@bloqer/services/payables-field";
import { PayablesFieldView } from "./payables-field-view";

export function PayablesFieldExperience({
  rows,
  hrefPrefix,
  queryMs,
}: {
  rows: PayablesFieldRow[];
  hrefPrefix: string;
  queryMs?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fieldParam = searchParams.get("field");
  const [searchQuery, setSearchQuery] = useState("");
  const [fieldFilter, setFieldFilterState] = useState<PayablesFieldFilterId>(
    () => parsePayablesFieldFilter(searchParams.get("field")) ?? "pending",
  );

  function replaceParamsShallow(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    window.history.replaceState(window.history.state, "", url);
  }

  function setFieldFilter(next: PayablesFieldFilterId) {
    setFieldFilterState(next);
    replaceParamsShallow((params) => {
      params.set("field", next);
    });
  }

  useEffect(() => {
    if (parsePayablesFieldFilter(fieldParam)) return;
    setFieldFilterState("pending");
    replaceParamsShallow((params) => {
      params.set("field", "pending");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldParam]);

  return (
    <PayablesFieldView
      rows={rows}
      hrefPrefix={hrefPrefix}
      fieldParam={fieldFilter}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onFilterChange={setFieldFilter}
      queryMs={queryMs}
    />
  );
}
