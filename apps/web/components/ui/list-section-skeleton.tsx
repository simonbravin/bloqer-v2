import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ListSectionSkeleton({
  variant = "table",
  rows = 5,
  className,
}: {
  variant?: "table" | "cards";
  rows?: number;
  className?: string;
}) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-lg border p-4", className)}>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
