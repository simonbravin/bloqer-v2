import { cn } from "@/lib/utils";

export type PageShellVariant = "default" | "wide" | "form" | "detail" | "narrow";

const variantClass: Record<PageShellVariant, string> = {
  default: "shell-page",
  wide:    "shell-page-wide",
  form:    "shell-page-form",
  detail:  "shell-page-detail",
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
