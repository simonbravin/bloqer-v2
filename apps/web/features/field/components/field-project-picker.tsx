"use client";

import { useRouter } from "next/navigation";
import type { FieldHomeProject } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { writeLastProjectIdCookie } from "@/lib/last-project-cookie";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: FieldHomeProject[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  afterSelectHref?: (projectId: string) => string;
};

export function FieldProjectPickerSheet({
  open,
  onOpenChange,
  projects,
  loading = false,
  error = null,
  onRetry,
  onCloseAutoFocus,
  afterSelectHref,
}: Props) {
  const router = useRouter();

  function select(id: string) {
    writeLastProjectIdCookie(id);
    onOpenChange(false);
    router.push(afterSelectHref ? afterSelectHref(id) : `/proyectos/${id}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[80vh] rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        data-testid="field-project-picker-sheet"
      >
        <SheetHeader>
          <SheetTitle>Seleccionar obra</SheetTitle>
          <SheetDescription>Elegí la obra en la que querés continuar.</SheetDescription>
        </SheetHeader>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">Cargando obras…</p>
        ) : error ? (
          <div className="mt-4 space-y-3" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            {onRetry ? <Button type="button" variant="outline" onClick={onRetry}>Reintentar</Button> : null}
          </div>
        ) : projects.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No hay obras disponibles.</p>
        ) : (
          <ul className="mt-4 space-y-2" data-testid="field-project-picker">
            {projects.map((project) => (
              <li key={project.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left"
                  onClick={() => select(project.id)}
                >
                  <span className="min-w-0 break-words">
                    <span className="font-medium">
                      {project.code} · {project.name}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
