"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  FINANCIAL_DOCUMENT_CLASS_LABEL_ES,
  SALES_INVOICE_CLASS_FILTER_CODES,
  SUPPLIER_INVOICE_CLASS_FILTER_CODES,
  type FinancialDocumentClassCode,
} from "@bloqer/domain";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DocumentClassFilterScope = "sales" | "supplier" | "supplier-project" | "sales-project";

function codesForScope(scope: DocumentClassFilterScope): FinancialDocumentClassCode[] {
  switch (scope) {
    case "sales":
      return [...SALES_INVOICE_CLASS_FILTER_CODES];
    case "sales-project":
      return SALES_INVOICE_CLASS_FILTER_CODES.filter((c) => c !== "INCOME_CORPORATE");
    case "supplier":
      return [...SUPPLIER_INVOICE_CLASS_FILTER_CODES];
    case "supplier-project":
      return SUPPLIER_INVOICE_CLASS_FILTER_CODES.filter((c) => c !== "OVERHEAD");
  }
}

type Props = {
  scope: DocumentClassFilterScope;
  /** Extra query keys to keep when changing class (status, search, etc.). */
  className?: string;
};

/** URL filter `?class=` for invoice listados ([D-102]). */
export function DocumentClassFilter({ scope, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const codes = codesForScope(scope);
  const rawClass = sp.get("class");
  const current =
    rawClass && codes.includes(rawClass as FinancialDocumentClassCode) ? rawClass : "_all";

  function update(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "_all") params.set("class", value);
    else params.delete("class");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={className ?? "space-y-1"}>
      <Label className="text-xs text-muted-foreground">Clase</Label>
      <Select value={current} onValueChange={update}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Todas las clases" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Todas las clases</SelectItem>
          {codes.map((code) => (
            <SelectItem key={code} value={code}>
              {FINANCIAL_DOCUMENT_CLASS_LABEL_ES[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
