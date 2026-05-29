"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props = {
  /** Query keys preserved when applying date filters (e.g. tab, status). */
  preserveParams?: string[];
  /** Param names for date range; defaults to from/to for AP tabs. */
  fromKey?: string;
  toKey?: string;
};

export function TransaccionesDateFilters({
  preserveParams = ["tab"],
  fromKey = "from",
  toKey = "to",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of preserveParams) {
      const v = sp.get(key);
      if (v) params.set(key, v);
    }
    const from = fd.get("from") as string;
    const to = fd.get("to") as string;
    if (from) params.set(fromKey, from);
    if (to) params.set(toKey, to);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    const params = new URLSearchParams();
    for (const key of preserveParams) {
      const v = sp.get(key);
      if (v) params.set(key, v);
    }
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input
          name="from"
          type="date"
          className="h-8 w-36 text-xs"
          defaultValue={sp.get(fromKey) ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input
          name="to"
          type="date"
          className="h-8 w-36 text-xs"
          defaultValue={sp.get(toKey) ?? ""}
        />
      </div>
      <Button type="submit" size="sm" className="h-8">
        Aplicar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clear}>
        Limpiar
      </Button>
    </form>
  );
}
