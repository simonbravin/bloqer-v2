"use client";

import { useEffect, useState } from "react";
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
  const hasBudgets = budgets.length > 0;

  useEffect(() => {
    if (defaultOpen && hasBudgets) setOpen(true);
  }, [defaultOpen, hasBudgets]);

  // No eligible budgets: still clear ?create=1 so the URL does not stay stuck.
  useEffect(() => {
    if (hasBudgets) return;
    if (searchParams.get("create") !== "1") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [hasBudgets, searchParams, pathname, router]);

  function clearCreateQueryParam() {
    if (searchParams.get("create") !== "1") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function closeDialog() {
    setOpen(false);
    clearCreateQueryParam();
  }

  function handleSuccess() {
    setOpen(false);
  }

  if (!hasBudgets) {
    return (
      <Button disabled title="Apruebe un presupuesto antes de crear una certificación">
        {triggerLabel}
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearCreateQueryParam();
      }}
    >
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva certificación</DialogTitle>
          <DialogDescription className="sr-only">
            Indicá el período y notas para crear la certificación.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CertificationForm
            projectId={projectId}
            budgets={budgets}
            defaultBudgetId={defaultBudgetId}
            onSubmit={onSubmit}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
