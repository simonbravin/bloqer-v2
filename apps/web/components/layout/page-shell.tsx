import { cn } from "@/lib/utils";

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
  children,
}: {
  variant?: PageShellVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(variantClass[variant], className)}>{children}</div>;
}
