"use client";

import { useEffect, useId, useRef } from "react";
import type { ProcessStep } from "@bloqer/domain";
import { cn } from "@/lib/utils";

type Props = {
  steps: ProcessStep[];
  "aria-label"?: string;
  className?: string;
};

function circleClass(state: ProcessStep["state"]): string {
  switch (state) {
    case "current":
      return "border-primary bg-background text-primary ring-2 ring-primary/20";
    case "done":
      return "border-primary/40 bg-primary/10 text-primary";
    case "cancelled":
      return "border-destructive bg-destructive/10 text-destructive";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

function labelClass(state: ProcessStep["state"]): string {
  switch (state) {
    case "current":
      return "text-foreground font-medium";
    case "cancelled":
      return "text-destructive font-medium";
    case "done":
      return "text-foreground";
    default:
      return "text-muted-foreground";
  }
}

function stepAccessibleName(step: ProcessStep): string {
  if (step.state === "cancelled" && step.replacedLabel) {
    return `${step.replacedLabel}: Anulada`;
  }
  return step.label;
}

export function ProcessStepper({
  steps,
  "aria-label": ariaLabel = "Progreso del proceso",
  className,
}: Props) {
  const scrollerRef = useRef<HTMLOListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);
  const summaryId = useId();

  const currentIndex = steps.findIndex((s) => s.state === "current" || s.state === "cancelled");
  const current = currentIndex >= 0 ? steps[currentIndex] : undefined;
  const allDone = steps.length > 0 && steps.every((s) => s.state === "done");
  const trackCancelled = steps.some((s) => s.state === "cancelled");
  const isCancelled = current?.state === "cancelled";
  const mobileSummary =
    steps.length === 0
      ? null
      : allDone
        ? "Proceso completo"
        : isCancelled && currentIndex >= 0
          ? `Anulada en paso ${currentIndex + 1} de ${steps.length}`
          : current && currentIndex >= 0
            ? `Paso ${currentIndex + 1} de ${steps.length} · ${current.label}`
            : null;

  useEffect(() => {
    if (steps.length === 0) return;
    const li = currentRef.current;
    const scroller = scrollerRef.current;
    if (!li || !scroller) return;

    const preferReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      const liRect = li.getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();
      // Only nudge horizontally when the active step is clipped — avoids jumping the page.
      if (liRect.left >= scRect.left && liRect.right <= scRect.right) return;
      li.scrollIntoView({
        behavior: preferReduced ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    };

    const raf = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(raf);
  }, [current?.id, steps.length]);

  if (steps.length === 0) return null;

  return (
    <div className={cn("rounded-lg border bg-card px-3 py-2.5", className)}>
      {mobileSummary ? (
        <p
          id={summaryId}
          className="mb-2 text-sm font-medium text-foreground sm:hidden"
          role="status"
        >
          {mobileSummary}
        </p>
      ) : null}
      <ol
        ref={scrollerRef}
        aria-label={ariaLabel}
        aria-describedby={mobileSummary ? summaryId : undefined}
        className={cn(
          "flex list-none items-center gap-0 overflow-x-auto overscroll-x-contain pb-0.5",
          // Thin scrollbar on small screens (discoverability); hide chrome on sm+.
          "[scrollbar-width:thin] sm:[scrollbar-width:none] sm:[-ms-overflow-style:none] sm:[&::-webkit-scrollbar]:hidden",
        )}
      >
        {steps.map((step, index) => {
          const n = index + 1;
          const isFocus = step.state === "current" || step.state === "cancelled";
          const dimUpcoming = trackCancelled && step.state === "upcoming";
          return (
            <li
              key={step.id}
              ref={isFocus ? currentRef : undefined}
              aria-current={isFocus ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center sm:min-w-0 sm:flex-1",
                dimUpcoming && "opacity-40",
              )}
            >
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums sm:size-6",
                    circleClass(step.state),
                  )}
                >
                  {n}
                </span>
                <span className="sr-only">{stepAccessibleName(step)}</span>
                {/* Labels: always on sm+; on mobile only the active step (summary covers the rest). */}
                <span
                  aria-hidden
                  className={cn(
                    "whitespace-nowrap text-xs",
                    labelClass(step.state),
                    isFocus ? "inline" : "hidden sm:inline",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1.5 h-px w-5 shrink-0 sm:mx-2 sm:w-auto sm:min-w-4 sm:flex-1",
                    step.state === "done" ? "bg-primary/30" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
