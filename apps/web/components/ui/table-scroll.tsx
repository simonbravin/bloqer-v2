import { cn } from "@/lib/utils";

/** Horizontal scroll wrapper for data tables on small screens. */
export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border", className)}>
      {children}
    </div>
  );
}
