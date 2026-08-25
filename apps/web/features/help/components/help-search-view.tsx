"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  HELP_ARTICLES,
  HELP_FEATURED_SLUGS,
  HELP_MODULE_LABELS,
  getHelpArticle,
  listHelpIntentChips,
  listHelpModulesInUse,
} from "@/features/help/lib/catalog";
import { searchHelpArticles } from "@/features/help/lib/search";
import type { HelpArticle, HelpIntent, HelpModule } from "@/features/help/lib/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { cn } from "@/lib/utils";

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      className={cn("h-8 rounded-full px-3 text-xs font-medium")}
    >
      {label}
    </Button>
  );
}

function ArticleResultList({ articles }: { articles: HelpArticle[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {articles.map((article) => (
        <li key={article.slug}>
          <Link
            href={`/ayuda/${article.slug}`}
            className="block px-4 py-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {article.title}
              </h2>
              <div className="flex flex-wrap gap-1">
                {article.modules.slice(0, 2).map((m) => (
                  <Badge key={m} variant="secondary" className="font-normal">
                    {HELP_MODULE_LABELS[m]}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
            {article.typicalRoles.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Quién: {article.typicalRoles.join(" · ")}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HelpSearchView() {
  const [query, setQuery] = useState("");
  const [module, setModule] = useState<HelpModule | null>(null);
  const [intent, setIntent] = useState<HelpIntent | null>(null);

  const modules = useMemo(() => listHelpModulesInUse(), []);
  const intents = useMemo(() => listHelpIntentChips(), []);

  const hasFilters = Boolean(query.trim() || module || intent);
  const browsing = !hasFilters;

  const featured = useMemo(
    () =>
      HELP_FEATURED_SLUGS.map((slug) => getHelpArticle(slug)).filter(
        (a): a is HelpArticle => a != null,
      ),
    [],
  );

  const results = useMemo(
    () => searchHelpArticles(HELP_ARTICLES, { query, module, intent }),
    [query, module, intent],
  );

  function clearFilters() {
    setQuery("");
    setModule(null);
    setIntent(null);
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá: cargar proveedor, pagar sueldos, comprar material…"
          className="h-12 pl-10 text-base"
          aria-label="Buscar en ayuda"
        />
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Qué quiero lograr
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro por objetivo">
            <FilterChip active={intent === null} label="Todos" onClick={() => setIntent(null)} />
            {intents.map((row) => (
              <FilterChip
                key={row.intent}
                active={intent === row.intent}
                label={row.label}
                onClick={() => setIntent(intent === row.intent ? null : row.intent)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Módulo
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro por módulo">
            <FilterChip active={module === null} label="Todos" onClick={() => setModule(null)} />
            {modules.map((m) => (
              <FilterChip
                key={m}
                active={module === m}
                label={HELP_MODULE_LABELS[m]}
                onClick={() => setModule(module === m ? null : m)}
              />
            ))}
          </div>
        </div>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
            Limpiar búsqueda y filtros
          </Button>
        ) : null}
      </div>

      <div>
        {browsing ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Empezá por un procedimiento frecuente, o buscá / filtrá arriba ({HELP_ARTICLES.length} en
              total).
            </p>
            <ArticleResultList articles={featured} />
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {results.length === 1 ? "1 procedimiento" : `${results.length} procedimientos`}
            </p>
            {results.length === 0 ? (
              <ListEmptyState
                title="No encontramos eso"
                description="Probá con otras palabras o limpiá los filtros. Objetivo y módulo se combinan (AND)."
                action={
                  hasFilters ? (
                    <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                      Limpiar filtros
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ArticleResultList articles={results} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
