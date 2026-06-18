import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ShellBreadcrumbLabel,
  ShellBreadcrumbSegmentLabels,
} from "@/components/layout/shell-breadcrumb-label";

export type PageShellVariant = "default" | "wide" | "form" | "detail" | "narrow";

/**
 * Anchos del workspace — usar `default` salvo tablas muy anchas (`wide`).
 * `form` / `detail` / `narrow` quedan por compatibilidad; no usarlos en páginas nuevas.
 */
const variantClass: Record<PageShellVariant, string> = {
  default: "shell-page",
  wide:    "shell-page-wide",
  form:    "shell-page",
  detail:  "shell-page",
  narrow:  "shell-page-narrow",
};

export function PageShell({
  variant = "default",
  className,
  breadcrumbLabel,
  breadcrumbSegmentLabels,
  children,
}: {
  variant?: PageShellVariant;
  className?: string;
  /** Overrides the last breadcrumb segment on detail routes (entity code, name, etc.). */
  breadcrumbLabel?: string;
  /** Labels keyed by URL segment id (UUID) for nested entity trails. */
  breadcrumbSegmentLabels?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <div className={cn(variantClass[variant], className)}>
      {breadcrumbLabel ? <ShellBreadcrumbLabel label={breadcrumbLabel} /> : null}
      {breadcrumbSegmentLabels ? (
        <ShellBreadcrumbSegmentLabels labels={breadcrumbSegmentLabels} />
      ) : null}
      {children}
    </div>
  );
}
