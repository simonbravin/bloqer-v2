import { cn } from "@/lib/utils";
import { formatPendingBadgeLabel, type PendingBadgeDensity } from "@/lib/pending-count-badge";

export function PendingCountBadge({
  count,
  density = "sidebar",
  className,
}: {
  count: number;
  density?: PendingBadgeDensity;
  className?: string;
}) {
  const label = formatPendingBadgeLabel(count, density);
  if (!label) return null;

  if (density === "compact") {
    return (
      <span
        aria-hidden
        data-testid="pending-count-badge"
        className={cn(
          "absolute -right-2 -top-1 rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground",
          className,
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      data-testid="pending-count-badge"
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold tabular-nums text-destructive-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
