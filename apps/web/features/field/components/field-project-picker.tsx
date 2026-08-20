"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FieldHomeProject } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { writeLastProjectIdCookie } from "@/lib/last-project-cookie";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: FieldHomeProject[];
  afterSelectHref?: (projectId: string) => string;
};

export function FieldProjectPickerSheet({ open, onOpenChange, projects, afterSelectHref }: Props) {
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
        className="max-h-[80vh] rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        data-testid="field-project-picker-sheet"
      >
        <SheetHeader>
          <SheetTitle>Seleccionar obra</SheetTitle>
        </SheetHeader>
        {projects.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No hay obras disponibles.</p>
        ) : (
          <ul className="mt-4 space-y-2" data-testid="field-project-picker">
            {projects.map((project) => (
              <li key={project.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 w-full justify-start py-3 text-left"
                  onClick={() => select(project.id)}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {project.code} · {project.name}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="ghost" className="mt-4 min-h-11 w-full">
          <Link href="/proyectos" onClick={() => onOpenChange(false)}>
            Ver todas las obras
          </Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
