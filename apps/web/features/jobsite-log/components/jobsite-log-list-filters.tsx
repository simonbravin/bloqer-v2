"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchableCombobox,
  withNoneOption,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";

export type JobsiteLogListWbsOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
};

type Props = {
  wbsOptions: JobsiteLogListWbsOption[];
};

export function JobsiteLogListFilters({ wbsOptions }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [wbsNodeId, setWbsNodeId] = useState(params.get("wbsNodeId") ?? "__all__");
  const [status, setStatus] = useState(params.get("status") ?? "__all__");
  const [dateFrom, setDateFrom] = useState(params.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(params.get("dateTo") ?? "");

  useEffect(() => {
    setWbsNodeId(params.get("wbsNodeId") ?? "__all__");
    setStatus(params.get("status") ?? "__all__");
    setDateFrom(params.get("dateFrom") ?? "");
    setDateTo(params.get("dateTo") ?? "");
  }, [params]);

  const wbsComboboxOptions = useMemo(
    () =>
      withNoneOption(wbsToSearchableOptions(wbsOptions), {
        label: "— todas las partidas —",
        value: "__all__",
      }),
    [wbsOptions],
  );

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dateFrom && dateTo && dateFrom > dateTo) return;
    const sp = new URLSearchParams(params.toString());
    sp.delete("dateFrom");
    sp.delete("dateTo");
    sp.delete("wbsNodeId");
    sp.delete("status");
    if (dateFrom) sp.set("dateFrom", dateFrom);
    if (dateTo) sp.set("dateTo", dateTo);
    if (wbsNodeId && wbsNodeId !== "__all__") sp.set("wbsNodeId", wbsNodeId);
    if (status && status !== "__all__") sp.set("status", status);
    router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
  }

  function clear() {
    setWbsNodeId("__all__");
    setStatus("__all__");
    setDateFrom("");
    setDateTo("");
    const sp = new URLSearchParams(params.toString());
    sp.delete("dateFrom");
    sp.delete("dateTo");
    sp.delete("wbsNodeId");
    sp.delete("status");
    router.push(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
  }

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <Label className="text-xs">Desde</Label>
        <Input
          name="dateFrom"
          type="date"
          className="h-8 text-xs w-36"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hasta</Label>
        <Input
          name="dateTo"
          type="date"
          className="h-8 text-xs w-36"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>
      <div className="space-y-1 min-w-[14rem] flex-1 max-w-md">
        <Label className="text-xs">Partida WBS afectada</Label>
        <SearchableCombobox
          popoverWidth="wide"
          className="h-8 text-xs"
          options={wbsComboboxOptions}
          value={wbsNodeId}
          onValueChange={setWbsNodeId}
          placeholder="— todas las partidas —"
          searchPlaceholder="Buscar partida…"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Estado</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="— todos —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">— todos —</SelectItem>
            <SelectItem value="DRAFT">Borrador</SelectItem>
            <SelectItem value="SUBMITTED">Enviado</SelectItem>
            <SelectItem value="APPROVED">Aprobado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" className="h-8" disabled={dateRangeInvalid}>
        Aplicar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clear}>
        Limpiar
      </Button>
      {dateRangeInvalid && (
        <p className="w-full text-xs text-destructive">
          La fecha «desde» no puede ser posterior a «hasta».
        </p>
      )}
    </form>
  );
}
