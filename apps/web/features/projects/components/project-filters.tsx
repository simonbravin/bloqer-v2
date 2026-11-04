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
  const urlQuery = searchParams.toString();
  const draft = useRef(new URLSearchParams(urlQuery));
  const pendingQueries = useRef(new Set<string>());
  const previousUrl = useRef({ pathname, query: urlQuery });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftQuery, setDraftQuery] = useState(urlQuery);
  const [searchText, setSearchText] = useState(searchParams.get("search") ?? "");

  // Several edits may happen before Next delivers the preceding URL update.
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

  const navigate = useCallback((method: "push" | "replace") => {
    const query = draft.current.toString();
    pendingQueries.current.add(query);
    router[method](query ? `${pathname}?${query}` : pathname);
  }, [pathname, router]);

  const update = useCallback(
    (key: string, value: string, debounce = false) => {
      if (timer.current) clearTimeout(timer.current);
      const params = new URLSearchParams(draft.current.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      draft.current = params;
      setDraftQuery(params.toString());
      if (debounce) timer.current = setTimeout(() => navigate("replace"), 300);
      else navigate("push");
    },
    [navigate],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Input
        aria-label="Buscar proyectos por nombre o código"
        placeholder="Buscar por nombre o código..."
        value={searchText}
        maxLength={200}
        onChange={(e) => { setSearchText(e.target.value); update("search", e.target.value.trim(), true); }}
        className="h-11 w-full min-w-0 sm:h-9 sm:w-64"
      />
      <Select
        value={new URLSearchParams(draftQuery).get("status") ?? "all"}
        onValueChange={(v) => update("status", v === "all" ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar proyectos por estado" className="h-11 w-full sm:h-9 sm:w-40">
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
