"use client";

import { useEffect, useRef } from "react";
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

export function ProcessStepper({
  steps,
  "aria-label": ariaLabel = "Progreso del proceso",
  className,
}: Props) {
  const scrollerRef = useRef<HTMLOListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);

  const current = steps.find((s) => s.state === "current" || s.state === "cancelled");
  const currentIndex = current ? steps.findIndex((s) => s.id === current.id) : -1;
  const allDone = steps.length > 0 && steps.every((s) => s.state === "done");
  const mobileSummary = allDone
    ? "Proceso completo"
    : current && currentIndex >= 0
      ? `Paso ${currentIndex + 1} de ${steps.length} · ${current.label}`
      : null;

  useEffect(() => {
    const li = currentRef.current;
    const scroller = scrollerRef.current;
    if (!li || !scroller) return;
    const liRect = li.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    // Only nudge horizontally when the active step is clipped — avoids jumping the page.
    if (liRect.left >= scRect.left && liRect.right <= scRect.right) return;
    li.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current?.id]);

  return (
    <div className={cn("rounded-lg border bg-card px-3 py-2.5", className)}>
      {mobileSummary ? (
        <p className="mb-2 text-sm font-medium text-foreground sm:hidden">{mobileSummary}</p>
      ) : null}
      <ol
        ref={scrollerRef}
        aria-label={ariaLabel}
        className="flex items-center gap-0 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, index) => {
          const n = index + 1;
          const isFocus = step.state === "current" || step.state === "cancelled";
          return (
            <li
              key={step.id}
              ref={isFocus ? currentRef : undefined}
              className="flex shrink-0 items-center sm:min-w-0 sm:flex-1"
            >
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  aria-current={isFocus ? "step" : undefined}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums sm:size-6",
                    circleClass(step.state),
                  )}
                >
                  {n}
                </span>
                {/* Labels: always on sm+; on mobile only the active step (summary covers the rest). */}
                <span
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
