"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { HelpArticle } from "@/features/help/lib/types";
import { HELP_MODULE_LABELS, getHelpArticle } from "@/features/help/lib/catalog";
import { resolveHelpHref } from "@/features/help/lib/search";
import { useFieldProjectContext } from "@/lib/field-project-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function HelpArticleView({ article }: { article: HelpArticle }) {
  const { convenienceProjectId } = useFieldProjectContext();
  const related = article.relatedSlugs
    .map((slug) => getHelpArticle(slug))
    .filter((a): a is HelpArticle => a != null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/ayuda">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Volver a Ayuda
          </Link>
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {article.modules.map((m) => (
            <Badge key={m} variant="secondary">
              {HELP_MODULE_LABELS[m]}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{article.title}</h1>
        <p className="mt-2 text-muted-foreground">{article.summary}</p>
      </div>

      {article.figure ? (
        <figure className="overflow-hidden rounded-lg border bg-muted/30">
          {/* Static process maps from /public/help; keep intrinsic ratio. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.figure.src} alt={article.figure.alt} className="h-auto w-full" />
          {article.figure.caption ? (
            <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
              {article.figure.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dónde</CardTitle>
          <CardDescription>{article.where.menu}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {article.typicalRoles.length > 0 ? (
            <p className="text-sm">
              <span className="font-medium">Quién suele hacerlo: </span>
              {article.typicalRoles.join(" · ")}
            </p>
          ) : null}
          {article.permissionHint ? (
            <p className="text-sm text-muted-foreground">{article.permissionHint}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {article.hrefs.map((href, i) => {
              const resolved = resolveHelpHref(href, convenienceProjectId);
              const key = href.kind === "company" ? href.path : href.suffix;
              return (
                <Button key={key} asChild size="sm" variant={i === 0 ? "default" : "outline"}>
                  <Link href={resolved.href}>
                    {resolved.needsProject ? "Elegí una obra" : resolved.label}
                    {!resolved.needsProject ? (
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" aria-hidden />
                    ) : null}
                  </Link>
                </Button>
              );
            })}
          </div>
          {article.hrefs.some((h) => h.kind === "project") && !convenienceProjectId ? (
            <p className="text-xs text-muted-foreground">
              Este procedimiento es de obra: entrá a un proyecto y volvé, o abrí Proyectos y seguí el menú
              indicado.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{article.stepsTitle ?? "Pasos"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {article.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {article.effects && article.effects.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Qué pasa en el sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {article.effects.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {article.pitfalls && article.pitfalls.length > 0 ? (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evitar</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {article.pitfalls.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {related.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Relacionados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/ayuda/${r.slug}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">Guía operativa {article.guideRef}</p>
    </div>
  );
}
