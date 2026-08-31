"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Archive, ArchiveRestore, Trash2, CircleX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { rethrowNextNavigationError } from "@/lib/next-errors";
import { cn } from "@/lib/utils";

const iconBtn = "h-7 w-7 shrink-0";
const iconSvg = "h-3.5 w-3.5";

function ConfirmIconButton({
  label,
  title,
  description,
  confirmLabel,
  destructive,
  icon,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  icon: ReactNode;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(iconBtn, destructive && "text-destructive hover:text-destructive")}
        title={label}
        aria-label={label}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {icon}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  try {
                    await onConfirm();
                    setOpen(false);
                  } catch (err) {
                    rethrowNextNavigationError(err);
                    toast.error(err instanceof Error ? err.message : "No se pudo completar la acción");
                  }
                });
              }}
            >
              {pending ? "Esperá…" : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function DocumentMutateIconActions({
  fileName,
  status,
  canMutate,
  onArchive,
  onRestore,
  onDelete,
}: {
  fileName: string;
  status: string;
  canMutate: boolean;
  onArchive?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  if (!canMutate) return null;

  const quoted = `«${fileName}»`;

  if (status === "UPLOADING" && onDelete) {
    return (
      <ConfirmIconButton
        label="Cancelar subida"
        title="¿Cancelar la subida?"
        description={`Se cancela la subida de ${quoted}.`}
        confirmLabel="Cancelar subida"
        destructive
        icon={<CircleX className={iconSvg} aria-hidden />}
        onConfirm={onDelete}
      />
    );
  }

  return (
    <>
      {status === "ACTIVE" && onArchive ? (
        <ConfirmIconButton
          label="Archivar"
          title="¿Archivar este archivo?"
          description={`${quoted} deja de figurar como activo. Después podés restaurarlo.`}
          confirmLabel="Archivar"
          icon={<Archive className={iconSvg} aria-hidden />}
          onConfirm={onArchive}
        />
      ) : null}
      {status === "ARCHIVED" && onRestore ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={iconBtn}
          title="Restaurar"
          aria-label="Restaurar"
          onClick={() => {
            void onRestore().catch((err: unknown) => {
              rethrowNextNavigationError(err);
              toast.error(err instanceof Error ? err.message : "No se pudo restaurar");
            });
          }}
        >
          <ArchiveRestore className={iconSvg} aria-hidden />
        </Button>
      ) : null}
      {status !== "DELETED" && status !== "UPLOADING" && onDelete ? (
        <ConfirmIconButton
          label="Eliminar"
          title="¿Eliminar este archivo?"
          description={`${quoted} se quita de los adjuntos.`}
          confirmLabel="Eliminar"
          destructive
          icon={<Trash2 className={iconSvg} aria-hidden />}
          onConfirm={onDelete}
        />
      ) : null}
    </>
  );
}
