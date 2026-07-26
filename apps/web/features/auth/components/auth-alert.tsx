import { cn } from "@/lib/utils";

type AuthAlertProps = {
  variant: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
};

export function AuthAlert({ variant, children, className }: AuthAlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm leading-relaxed",
        variant === "error" &&
          "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-300",
        variant === "success" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
        variant === "info" &&
          "border-border bg-muted/60 text-muted-foreground dark:bg-muted/40",
        className,
      )}
    >
      {children}
    </div>
  );
}
