"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  FISCAL_DOCUMENT_KIND_LABELS,
  isFiscalDocumentKind,
  type FiscalDocumentKindCode,
} from "@bloqer/domain";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KINDS: FiscalDocumentKindCode[] = ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"];

type Props = {
  className?: string;
};

/** URL filter `?kind=` for invoice listados ([D-115]). */
export function FiscalDocumentKindFilter({ className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const raw = sp.get("kind");
  const current = raw && isFiscalDocumentKind(raw) ? raw : "_all";

  function update(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "_all") params.set("kind", value);
    else params.delete("kind");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={className ?? "space-y-1"}>
      <Label className="text-xs text-muted-foreground">Tipo de documento</Label>
      <Select value={current} onValueChange={update}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Todos los tipos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Todos los tipos</SelectItem>
          {KINDS.map((code) => (
            <SelectItem key={code} value={code}>
              {FISCAL_DOCUMENT_KIND_LABELS[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
