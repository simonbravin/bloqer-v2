"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { SubdivideApuChoice } from "@bloqer/validators";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCode: string;
  parentName: string;
  childCode: string;
  onMigrate: () => void;
  onDiscard: () => void;
};

export function WbsSubdivideApuDialog({
  open,
  onOpenChange,
  parentCode,
  parentName,
  childCode,
  onMigrate,
  onDiscard,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subdividir ítem con cómputo</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1 text-sm text-muted-foreground">
              <p>
                <span className="font-mono text-foreground">{parentCode}</span>
                {" — "}
                {parentName} ya tiene APU o cantidades cargadas.
              </p>
              <p>
                Al agregar <span className="font-mono font-medium text-foreground">{childCode}</span>,
                ese ítem pasará a agrupar el subárbol. ¿Qué hacemos con el cómputo actual?
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button type="button" className="w-full" onClick={onMigrate}>
            Migrar cómputo al nuevo ítem ({childCode})
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={onDiscard}>
            Descartar cómputo y crear ítem vacío
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
