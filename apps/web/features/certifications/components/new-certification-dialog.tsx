"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { CertificationForm, type BudgetOption } from "./certification-form";
import type { CreateCertificationInput } from "@bloqer/validators";

interface Props {
  projectId: string;
  budgets: BudgetOption[];
  defaultBudgetId?: string;
  onSubmit: (data: CreateCertificationInput) => Promise<{ id: string } | { error: string }>;
  defaultOpen?: boolean;
  triggerLabel?: string;
}

export function NewCertificationDialog({
  projectId,
  budgets,
  defaultBudgetId,
  onSubmit,
  defaultOpen = false,
  triggerLabel = "Nueva certificación",
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const hasBudgets = budgets.length > 0;

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  function clearCreateQueryParam() {
    if (searchParams.get("create") !== "1") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function closeDialog() {
    if (running.current) return;
    setOpen(false);
    clearCreateQueryParam();
  }

  function handleSuccess() {
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && running.current) return;
        setOpen(next);
        if (!next) clearCreateQueryParam();
      }}
    >
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent
        closeButtonDisabled={pending}
        className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Nueva certificación</DialogTitle>
          <DialogDescription className="sr-only">
            {hasBudgets
              ? "Indicá el período y notas para crear la certificación."
              : "Se necesita un presupuesto aprobado para crear una certificación."}
          </DialogDescription>
        </DialogHeader>
        {!hasBudgets ? (
          <ListEmptyState
            className="border-0 bg-transparent p-2"
            title="No hay presupuesto aprobado"
            description="Aprobá un presupuesto del proyecto (o usá uno cerrado) antes de crear una certificación."
            action={
              <Button asChild variant="outline">
                <Link href={`/proyectos/${projectId}/presupuestos`} onClick={closeDialog}>
                  Ir a presupuestos
                </Link>
              </Button>
            }
          />
        ) : open ? (
          <CertificationForm
            projectId={projectId}
            budgets={budgets}
            defaultBudgetId={defaultBudgetId}
            onSubmit={onSubmit}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
            onPendingChange={(value) => {
              running.current = value;
              setPending(value);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
