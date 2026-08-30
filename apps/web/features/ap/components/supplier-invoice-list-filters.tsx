"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";
import { TransaccionesDateFilters } from "@/features/finance/components/transacciones-date-filters";
import { DocumentClassFilter } from "@/features/finance/components/document-class-filter";

type Props = {
  /** Query keys preserved when clearing/applying date filters. */
  preserveParams?: string[];
  showDateFilters?: boolean;
  searchPlaceholder?: string;
  /** When set, shows Clase filter (`?class=`). */
  classFilterScope?: "supplier" | "supplier-project";
};

export function SupplierInvoiceListFilters({
  preserveParams = ["status", "search", "sort", "dir", "view", "class"],
  showDateFilters = true,
  searchPlaceholder = "Buscar por código o proveedor…",
  classFilterScope,
}: Props) {
  const { defaultValue, setDebounced } = useDebouncedSearchParam("search");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="supplier-invoice-search" className="sr-only">
            Buscar facturas
          </Label>
          <Input
            id="supplier-invoice-search"
            type="search"
            placeholder={searchPlaceholder}
            defaultValue={defaultValue}
            onChange={(e) => setDebounced(e.target.value)}
            className="max-w-md"
          />
        </div>
        {classFilterScope ? <DocumentClassFilter scope={classFilterScope} /> : null}
      </div>
      {showDateFilters ? (
        <TransaccionesDateFilters preserveParams={preserveParams} fromKey="from" toKey="to" />
      ) : null}
    </div>
  );
}
