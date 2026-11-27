"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";
import { DocumentClassFilter } from "@/features/finance/components/document-class-filter";
import { FiscalDocumentKindFilter } from "@/features/finance/components/fiscal-document-kind-filter";

/** Filters for AR invoice lists (`?search=` `?kind=` `?class=`). */
export function SalesInvoiceListFilters({ company = false }: { company?: boolean }) {
  const { defaultValue, setDebounced } = useDebouncedSearchParam("search");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-[12rem] flex-1 space-y-1">
        <Label htmlFor="sales-invoice-search" className="sr-only">
          Buscar facturas
        </Label>
        <Input
          id="sales-invoice-search"
          type="search"
          placeholder="Buscar por código o cliente…"
          defaultValue={defaultValue}
          onChange={(e) => setDebounced(e.target.value)}
          className="max-w-md"
        />
      </div>
      <FiscalDocumentKindFilter />
      {!company ? <DocumentClassFilter scope="sales-project" /> : null}
    </div>
  );
}
