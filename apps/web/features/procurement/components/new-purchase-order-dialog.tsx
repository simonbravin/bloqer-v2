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
import { PurchaseOrderForm, type SupplierOption } from "./purchase-order-form";
import type { ProductOption, WbsOption } from "./purchase-order-lines-editor";

interface Props {
  projectId: string;
  suppliers: SupplierOption[];
  wbsOptions: WbsOption[];
  productOptions: ProductOption[];
  allowEmergencyDirectPo?: boolean;
  defaultOpen?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}

export function NewPurchaseOrderDialog({
  projectId,
  suppliers,
  wbsOptions,
  productOptions,
  allowEmergencyDirectPo = false,
  defaultOpen = false,
  triggerLabel = "Nueva OC",
  triggerVariant = "default",
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);

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
    setOpen(false);
    clearCreateQueryParam();
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
        if (!next) clearCreateQueryParam();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva orden de compra</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos para crear una orden de compra del proyecto.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PurchaseOrderForm
            projectId={projectId}
            suppliers={suppliers}
            wbsOptions={wbsOptions}
            productOptions={productOptions}
            allowEmergencyDirectPo={allowEmergencyDirectPo}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
