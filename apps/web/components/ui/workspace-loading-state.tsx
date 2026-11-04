import { ListSectionSkeleton } from "./list-section-skeleton";
import { Skeleton } from "./skeleton";

export function WorkspaceLoadingState() {
  return (
    <div role="status" aria-live="polite" className="shell-page space-y-6">
      <p className="text-sm text-muted-foreground">Cargando contenido…</p>
      <div aria-hidden="true" className="space-y-6">
        <Skeleton className="h-8 w-48 max-w-full" />
        <ListSectionSkeleton rows={4} />
      </div>
    </div>
  );
}
