"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";
import { TransaccionesDateFilters } from "@/features/finance/components/transacciones-date-filters";

type Props = {
  /** Query keys preserved when clearing/applying date filters. */
  preserveParams?: string[];
  showDateFilters?: boolean;
  searchPlaceholder?: string;
};

export function SupplierInvoiceListFilters({
  preserveParams = ["status", "search", "sort", "dir", "view"],
  showDateFilters = true,
  searchPlaceholder = "Buscar por código o proveedor…",
}: Props) {
  const { defaultValue, setDebounced } = useDebouncedSearchParam("search");

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
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
      {showDateFilters ? (
        <TransaccionesDateFilters preserveParams={preserveParams} fromKey="from" toKey="to" />
      ) : null}
    </div>
  );
}
