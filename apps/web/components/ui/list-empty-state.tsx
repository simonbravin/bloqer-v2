import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ListEmptyState({
  message,
  title,
  description,
  action,
  className,
}: {
  /** @deprecated Prefer `title` + `description` when adding CTAs. */
  message?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const heading = title ?? message;
  const body = title ? description : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {heading ? (
        <h3 className={cn(action || body ? "font-medium text-foreground" : undefined)}>
          {heading}
        </h3>
      ) : null}
      {body ? <p className="mt-1">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
