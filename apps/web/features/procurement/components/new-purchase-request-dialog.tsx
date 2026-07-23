"use client";

import { useEffect, useMemo, useState } from "react";
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
import { PurchaseRequestForm } from "./purchase-request-form";
import type { WbsOption } from "./purchase-order-lines-editor";

interface Props {
  projectId: string;
  wbsOptions: WbsOption[];
  defaultOpen?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  initialLine?: {
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
  };
  prefilledFromMaterials?: boolean;
}

export function NewPurchaseRequestDialog({
  projectId,
  wbsOptions,
  defaultOpen = false,
  triggerLabel = "Nueva solicitud",
  triggerVariant = "default",
  initialLine,
  prefilledFromMaterials = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const formKey = useMemo(
    () =>
      [
        initialLine?.wbsNodeId ?? "",
        initialLine?.description ?? "",
        initialLine?.quantity ?? "",
        initialLine?.productId ?? "",
        prefilledFromMaterials ? "1" : "0",
      ].join("|"),
    [initialLine, prefilledFromMaterials],
  );

  function clearCreateQueryParams() {
    const hasCreate = searchParams.get("create") === "1";
    const hasPrefill =
      Boolean(searchParams.get("from")) ||
      Boolean(searchParams.get("wbsNodeId")) ||
      Boolean(searchParams.get("description")) ||
      Boolean(searchParams.get("quantity")) ||
      Boolean(searchParams.get("productId"));
    if (!hasCreate && !hasPrefill) return;

    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    next.delete("from");
    next.delete("wbsNodeId");
    next.delete("description");
    next.delete("quantity");
    next.delete("productId");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function closeDialog() {
    setOpen(false);
    clearCreateQueryParams();
  }

  /** Avoid router.replace racing the form's router.push to the detail page. */
  function handleSuccess() {
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearCreateQueryParams();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva solicitud de compra</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos para crear una solicitud de compra del proyecto.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PurchaseRequestForm
            key={formKey}
            projectId={projectId}
            wbsOptions={wbsOptions}
            initialLine={initialLine}
            prefilledFromMaterials={prefilledFromMaterials}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
