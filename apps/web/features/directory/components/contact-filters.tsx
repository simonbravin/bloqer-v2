"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const urlQuery = searchParams.toString();
  const draft = useRef(new URLSearchParams(urlQuery));
  const pendingQueries = useRef(new Set<string>());
  const previousUrl = useRef({ pathname, query: urlQuery });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftQuery, setDraftQuery] = useState(urlQuery);
  const [searchText, setSearchText] = useState(searchParams.get("search") ?? "");

  // Keep local edits when an earlier navigation arrives. Back/forward or an
  // external URL change replaces the draft and cancels its outstanding search.
  useEffect(() => {
    if (previousUrl.current.pathname === pathname && previousUrl.current.query === urlQuery) return;
    const ownNavigation = previousUrl.current.pathname === pathname && pendingQueries.current.has(urlQuery);
    previousUrl.current = { pathname, query: urlQuery };
    if (ownNavigation) {
      pendingQueries.current.delete(urlQuery);
      if (urlQuery === draft.current.toString()) pendingQueries.current.clear();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    pendingQueries.current.clear();
    draft.current = new URLSearchParams(urlQuery);
    setDraftQuery(urlQuery);
    setSearchText(draft.current.get("search") ?? "");
  }, [pathname, urlQuery]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const navigate = useCallback(() => {
    const query = draft.current.toString();
    pendingQueries.current.add(query);
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router]);

  const displayedParams = new URLSearchParams(draftQuery);
  const roleParam = displayedParams.get("role") ?? "ALL";
  const roleValue = ROLE_OPTIONS.some((o) => o.value === roleParam) ? roleParam : "ALL";
  const statusParam = displayedParams.get("status");
  const statusValue =
    statusParam == null
      ? "ACTIVE"
      : STATUS_OPTIONS.some((o) => o.value === statusParam)
        ? statusParam
        : "ACTIVE";

  const updateParam = useCallback(
    (key: string, value: string, debounce = false) => {
      if (timer.current) clearTimeout(timer.current);
      const params = new URLSearchParams(draft.current.toString());
      if (!value || (value === "ALL" && key !== "status")) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete("page");
      draft.current = params;
      setDraftQuery(params.toString());
      if (debounce) timer.current = setTimeout(navigate, 300);
      else navigate();
    },
    [navigate],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Input
        aria-label="Buscar contactos por nombre o CUIT"
        placeholder="Buscar por nombre, CUIT..."
        value={searchText}
        maxLength={200}
        onChange={(e) => { setSearchText(e.target.value); updateParam("search", e.target.value.trim(), true); }}
        className="h-11 w-full min-w-0 sm:h-9 sm:w-64"
      />
      <Select
        value={roleValue}
        onValueChange={(v) => updateParam("role", v)}
      >
        <SelectTrigger aria-label="Filtrar contactos por rol" className="h-11 w-full sm:h-9 sm:w-48">
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
        value={statusValue}
        onValueChange={(v) => updateParam("status", v)}
      >
        <SelectTrigger aria-label="Filtrar contactos por estado" className="h-11 w-full sm:h-9 sm:w-44">
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
