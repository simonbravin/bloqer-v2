"use client";

import { Input } from "@/components/ui/input";
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";

export function AccountingAccountListFilters() {
  const { defaultValue, setDebounced } = useDebouncedSearchParam("q");

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        type="search"
        placeholder="Buscar por código o nombre…"
        defaultValue={defaultValue}
        onChange={(e) => setDebounced(e.target.value)}
        className="h-9 w-full max-w-sm"
        aria-label="Buscar cuentas contables"
      />
    </div>
  );
}
