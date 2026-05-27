import { cn } from "@/lib/utils";

export function ListEmptyState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {message}
    </div>
  );
}
