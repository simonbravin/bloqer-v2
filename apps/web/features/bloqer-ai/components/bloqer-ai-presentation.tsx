"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  HelpCircle,
  Package,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import type { AiPresentation, AiInsight, AiInsightSeverity } from "@bloqer/ai";
import { cn } from "@/lib/utils";
import { filterSafeAiLinks } from "@/features/bloqer-ai/lib/safe-ai-content";
import { Button } from "@/components/ui/button";

const SEVERITY_STYLES: Record<AiInsightSeverity, string> = {
  critical: "border-red-500/40 bg-red-500/5",
  attention: "border-amber-500/40 bg-amber-500/5",
  pending: "border-sky-500/40 bg-sky-500/5",
  info: "border-border bg-background",
  neutral: "border-border bg-background",
};

const SEVERITY_LABEL: Record<AiInsightSeverity, string> = {
  critical: "Crítico",
  attention: "Atención",
  pending: "Pendiente",
  info: "Info",
  neutral: "",
};

function insightIcon(kind: AiInsight["kind"]) {
  switch (kind) {
    case "schedule":
      return CalendarClock;
    case "procurement":
      return ShoppingCart;
    case "materials":
      return Package;
    case "payables":
    case "receivables":
      return CircleDollarSign;
    case "cash":
      return Wallet;
    case "help":
      return HelpCircle;
    case "field":
    case "certification":
    case "budget":
      return ClipboardList;
    default:
      return AlertTriangle;
  }
}

function SafeLinks({
  links,
  onNavigate,
}: {
  links: { label: string; href: string }[];
  onNavigate?: () => void;
}) {
  const safe = filterSafeAiLinks(links);
  if (!safe.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {safe.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className="inline-flex min-h-8 items-center rounded-md border border-border/80 bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function BloqerAiPresentationView({
  presentation,
  onFollowUp,
  onNavigate,
}: {
  presentation: AiPresentation;
  onFollowUp?: (question: string) => void;
  onNavigate?: () => void;
}) {
  const [showSecondary, setShowSecondary] = useState(false);
  const isExecutive = presentation.kind === "executive";
  const isDirect = presentation.kind === "direct";

  return (
    <div
      data-testid="bloqer-ai-presentation"
      data-kind={presentation.kind}
      className="space-y-3 text-sm"
    >
      <div>
        <p className="text-base font-semibold leading-snug">{presentation.headline}</p>
        {presentation.summary ? (
          <p className="mt-1 text-muted-foreground">{presentation.summary}</p>
        ) : null}
      </div>

      {presentation.insights.length > 0 ? (
        <div className={cn("space-y-2", isDirect && "space-y-1")}>
          {presentation.insights.map((insight, idx) => {
            const Icon = insightIcon(insight.kind);
            return (
              <div
                key={`${insight.title}-${idx}`}
                data-testid="bloqer-ai-insight"
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  SEVERITY_STYLES[insight.severity],
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium">{insight.title}</span>
                      {insight.value ? (
                        <span className="text-muted-foreground">{insight.value}</span>
                      ) : null}
                      {SEVERITY_LABEL[insight.severity] ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {SEVERITY_LABEL[insight.severity]}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">{insight.explanation}</p>
                    {insight.recommendation ? (
                      <p className="text-foreground/90">{insight.recommendation}</p>
                    ) : null}
                    <SafeLinks links={insight.links} onNavigate={onNavigate} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {presentation.actions.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border bg-muted/40 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qué haría hoy
          </p>
          <ol className="list-decimal space-y-1.5 pl-4">
            {presentation.actions.map((action) => (
              <li key={`${action.rank}-${action.label}`} className="leading-snug">
                <span>{action.label}</span>
                <SafeLinks links={action.links} onNavigate={onNavigate} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {isExecutive && presentation.secondaryMetrics.length > 0 ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setShowSecondary((v) => !v)}
          >
            {showSecondary ? "Ocultar más datos" : "Ver más datos"}
          </Button>
          {showSecondary ? (
            <dl className="mt-1 space-y-1 rounded-md border px-3 py-2 text-xs text-muted-foreground">
              {presentation.secondaryMetrics.map((m) => (
                <div key={m.label} className="flex justify-between gap-3">
                  <dt>{m.label}</dt>
                  <dd className="text-right text-foreground">
                    {m.value}
                    {m.note ? <span className="block text-muted-foreground">{m.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {presentation.followUps.length > 0 && onFollowUp ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {presentation.followUps.map((q) => (
            <button
              key={q}
              type="button"
              data-testid="bloqer-ai-followup"
              className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => onFollowUp(q)}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
