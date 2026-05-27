"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";

const STATUSES = [
  { value: "DRAFT",     label: "Borrador" },
  { value: "ACTIVE",    label: "Activo" },
  { value: "ON_HOLD",   label: "En pausa" },
  { value: "COMPLETED", label: "Completado" },
  { value: "CANCELLED", label: "Cancelado" },
];

export function ProjectFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { defaultValue: searchDefault, setDebounced: setSearchDebounced } = useDebouncedSearchParam("search");

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Buscar por nombre o código..."
        defaultValue={searchDefault}
        onChange={(e) => setSearchDebounced(e.target.value)}
        className="h-9 w-64"
      />
      <Select
        value={searchParams.get("status") ?? ""}
        onValueChange={(v) => update("status", v === "all" ? "" : v)}
      >
        <SelectTrigger className="h-9 w-40">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
