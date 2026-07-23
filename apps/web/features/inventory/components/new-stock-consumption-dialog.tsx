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
import {
  ConsumptionForm,
  type ProductOption,
  type WarehouseOption,
  type WbsOption,
} from "./consumption-form";

interface Props {
  projectId: string;
  products: ProductOption[];
  warehouses: WarehouseOption[];
  wbsOptions: WbsOption[];
  defaultOpen?: boolean;
}

export function NewStockConsumptionDialog({
  projectId,
  products,
  warehouses,
  wbsOptions,
  defaultOpen = false,
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

  /**
   * Destination is the same list page. Clearing `create` here is safe and prevents
   * `defaultOpen` + refresh from reopening the dialog after a successful submit.
   */
  function handleSuccess() {
    setOpen(false);
    clearCreateQueryParam();
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
        <Button>Registrar consumo</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar consumo</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos para registrar un consumo de inventario del proyecto.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ConsumptionForm
            projectId={projectId}
            products={products}
            warehouses={warehouses}
            wbsOptions={wbsOptions}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
