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
import { PROCUREMENT_FORM_DIALOG_CLASS } from "@/features/procurement/lib/procurement-form-layout";
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
    costType?: "MATERIAL" | "LABOR" | "EQUIPMENT" | "SUBCONTRACT" | "OTHER";
  };
  prefilledFromMaterials?: boolean;
  /** Preserves `from=mano-obra|equipos|materiales` on mobile redirect to /nueva. */
  prefillFrom?: "materiales" | "mano-obra" | "equipos";
}

export function NewPurchaseRequestDialog({
  projectId,
  wbsOptions,
  defaultOpen = false,
  triggerLabel = "Nueva solicitud",
  triggerVariant = "default",
  initialLine,
  prefilledFromMaterials = false,
  prefillFrom,
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
    if (initialLine?.costType) next.set("costType", initialLine.costType);
    const from = prefillFrom ?? (prefilledFromMaterials ? "materiales" : undefined);
    if (from) next.set("from", from);
    const query = next.toString();
    return `/proyectos/${projectId}/solicitudes-compra/nueva${query ? `?${query}` : ""}`;
  }, [projectId, initialLine, prefilledFromMaterials, prefillFrom]);

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
      Boolean(searchParams.get("costAnalysisLineId")) ||
      Boolean(searchParams.get("unit")) ||
      Boolean(searchParams.get("costType"));
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
    next.delete("costType");
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

  if (!hasMounted) {
    return (
      <Button variant={triggerVariant} className="min-h-11" disabled>
        {triggerLabel}
      </Button>
    );
  }

  if (!isMdUp) {
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
      <DialogContent className={PROCUREMENT_FORM_DIALOG_CLASS}>
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
            prefillFrom={prefillFrom}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
