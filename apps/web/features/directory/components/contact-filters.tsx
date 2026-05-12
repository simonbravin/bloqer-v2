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

const ROLE_OPTIONS = [
  { value: "ALL", label: "Todos los roles" },
  { value: "CLIENT", label: "Clientes" },
  { value: "SUPPLIER", label: "Proveedores" },
  { value: "SUBCONTRACTOR", label: "Subcontratistas" },
  { value: "EMPLOYEE", label: "Empleados" },
  { value: "OTHER", label: "Otros" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activos" },
  { value: "ARCHIVED", label: "Archivados" },
];

export function ContactFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === "ALL") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Buscar por nombre, CUIT..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => updateParam("search", e.target.value)}
        className="h-9 w-64"
      />
      <Select
        defaultValue={searchParams.get("role") ?? "ALL"}
        onValueChange={(v) => updateParam("role", v)}
      >
        <SelectTrigger className="h-9 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        defaultValue={searchParams.get("status") ?? "ACTIVE"}
        onValueChange={(v) => updateParam("status", v)}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
