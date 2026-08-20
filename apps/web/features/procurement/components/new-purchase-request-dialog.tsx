"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useHasMounted, useIsMdUp } from "@/lib/media-query";
import { PurchaseRequestCreateComposer } from "./purchase-request-create-composer";
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
    costAnalysisLineId?: string;
    unit?: string;
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
  const hasMounted = useHasMounted();
  const isMdUp = useIsMdUp();

  const nuevoHref = useMemo(() => {
    const next = new URLSearchParams();
    if (initialLine?.wbsNodeId) next.set("wbsNodeId", initialLine.wbsNodeId);
    if (initialLine?.description) next.set("description", initialLine.description);
    if (initialLine?.quantity) next.set("quantity", initialLine.quantity);
    if (initialLine?.productId) next.set("productId", initialLine.productId);
    if (initialLine?.costAnalysisLineId) next.set("costAnalysisLineId", initialLine.costAnalysisLineId);
    if (initialLine?.unit) next.set("unit", initialLine.unit);
    if (prefilledFromMaterials) next.set("from", "materiales");
    const query = next.toString();
    return `/proyectos/${projectId}/solicitudes-compra/nueva${query ? `?${query}` : ""}`;
  }, [projectId, initialLine, prefilledFromMaterials]);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!hasMounted || isMdUp || !defaultOpen) return;
    router.replace(nuevoHref);
  }, [hasMounted, isMdUp, defaultOpen, router, nuevoHref]);

  function clearCreateQueryParams() {
    const hasCreate = searchParams.get("create") === "1";
    const hasPrefill =
      Boolean(searchParams.get("from")) ||
      Boolean(searchParams.get("wbsNodeId")) ||
      Boolean(searchParams.get("description")) ||
      Boolean(searchParams.get("quantity")) ||
      Boolean(searchParams.get("productId")) ||
      Boolean(searchParams.get("unit"));
    if (!hasCreate && !hasPrefill) return;

    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    next.delete("from");
    next.delete("wbsNodeId");
    next.delete("description");
    next.delete("quantity");
    next.delete("productId");
    next.delete("costAnalysisLineId");
    next.delete("unit");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function closeDialog() {
    setOpen(false);
    clearCreateQueryParams();
  }

  function handleSuccess() {
    setOpen(false);
  }

  if (hasMounted && !isMdUp) {
    return (
      <Button asChild variant={triggerVariant} className="min-h-11">
        <Link href={nuevoHref}>{triggerLabel}</Link>
      </Button>
    );
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
          <PurchaseRequestCreateComposer
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
