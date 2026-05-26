"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  PermissionAction,
  PermissionMatrixGrid,
  PermissionModule,
  PermissionModuleGroupSection,
  UserRole,
} from "@bloqer/domain";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { updateTenantPermissionMatrixNotesAction } from "@/app/(app)/configuracion/permission-matrix-actions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PermissionMatrixNoteDTO = {
  text: string;
  updatedAt: string;
  updatedByUserId: string | null;
};

type Props = {
  sections: readonly PermissionModuleGroupSection[];
  matrix: PermissionMatrixGrid;
  moduleLabelsEs: Record<PermissionModule, string>;
  notes: Partial<Record<PermissionModule, PermissionMatrixNoteDTO>>;
  canEditNotes: boolean;
};

function ceilingLabel(v: PermissionAction | null): string {
  if (v === null) return "—";
  if (v === "VIEW") return "Ver";
  if (v === "EDIT") return "Editar";
  return "Aprobar";
}

const ROLE_LABEL_ES: Record<UserRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  FINANCE: "Finanzas",
  PROCUREMENT: "Compras",
  WAREHOUSE: "Depósito",
  SALES: "Ventas",
  VIEWER: "Solo lectura",
  PROJECT_MANAGER: "Jefe de obra",
  SITE_FOREMAN: "Capataz",
  PROJECT_VIEWER: "Visor de proyecto",
};

export function PermissionMatrixOverview({
  sections,
  matrix,
  moduleLabelsEs,
  notes,
  canEditNotes,
}: Props) {
  const router = useRouter();
  const [openModule, setOpenModule] = useState<PermissionModule | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (openModule) {
      setDraft(notes[openModule]?.text ?? "");
    }
  }, [openModule, notes]);

  function openNoteEditor(mod: PermissionModule) {
    setOpenModule(mod);
    setError(null);
  }

  function saveNote() {
    if (!openModule) return;
    setError(null);
    startTransition(async () => {
      const res = await updateTenantPermissionMatrixNotesAction({
        notes: { [openModule]: { text: draft } },
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpenModule(null);
      router.refresh();
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Accordion
        type="multiple"
        className="w-full space-y-2"
        defaultValue={[...sections.map((s) => s.id)]}
      >
        {sections.map((section) => (
          <AccordionItem
            key={section.id}
            value={section.id}
            className="rounded-lg border border-border border-b-0 bg-card px-3 shadow-sm last:border-b-0"
          >
            <AccordionTrigger className="py-3 text-left text-sm font-semibold text-foreground hover:no-underline [&[data-state=open]]:no-underline">
              <span className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-2 text-left">
                <span>{section.labelEs}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  ({section.modules.length} módulos)
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-0">
              <div className="overflow-x-auto rounded-md border border-border/80">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="sticky left-0 z-10 min-w-[140px] bg-card text-xs font-medium text-foreground">
                        Rol
                      </TableHead>
                      {section.modules.map((m) => (
                        <TableHead key={m} className="min-w-[56px] px-1 text-center align-bottom">
                          <div className="flex flex-col items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default font-mono text-[11px] font-semibold tracking-tight text-foreground">
                                  {m}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-xs">
                                {moduleLabelsEs[m]}
                              </TooltipContent>
                            </Tooltip>
                            {notes[m] || canEditNotes ? (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-[10px] text-primary"
                                onClick={() => openNoteEditor(m)}
                              >
                                {notes[m] ? (canEditNotes ? "Nota" : "Ver nota") : "Agregar nota"}
                              </Button>
                            ) : null}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.roles.map((role) => (
                      <TableRow key={role}>
                        <TableCell className="sticky left-0 z-10 bg-card text-xs font-medium">
                          <span className="block text-foreground">{ROLE_LABEL_ES[role] ?? role}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">{role}</span>
                        </TableCell>
                        {section.modules.map((m) => (
                          <TableCell key={m} className="px-1 text-center text-xs tabular-nums text-muted-foreground">
                            {ceilingLabel(matrix.grid[role][m])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Sheet
        open={openModule !== null}
        onOpenChange={(open) => {
          if (!open) setOpenModule(null);
        }}
      >
        <SheetContent className="flex w-full flex-col border-border bg-card sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-foreground">
              Nota — {openModule ? `${openModule}` : ""}
            </SheetTitle>
            <SheetDescription>{openModule ? moduleLabelsEs[openModule] : ""}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col space-y-2 py-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              placeholder="Texto interno para el equipo (no cambia permisos reales)."
              className="min-h-[160px] flex-1 resize-y bg-background text-foreground"
              readOnly={!canEditNotes}
            />
            {openModule && notes[openModule] ? (
              <p className="text-[11px] text-muted-foreground">
                Última actualización: {formatDateTime(notes[openModule]!.updatedAt)}
              </p>
            ) : null}
          </div>
          <SheetFooter className="gap-2 border-t border-border pt-4">
            {canEditNotes ? (
              <>
                <Button type="button" variant="outline" onClick={() => setOpenModule(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="button" onClick={saveNote} disabled={pending}>
                  {pending ? "Guardando…" : "Guardar"}
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setOpenModule(null)}>
                Cerrar
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
