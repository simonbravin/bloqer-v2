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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHasMounted, useIsMdUp } from "@/lib/media-query";
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
  const hasMounted = useHasMounted();
  const isMdUp = useIsMdUp();
  const useSheet = hasMounted && !isMdUp;

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

  function handleSuccess() {
    setOpen(false);
    clearCreateQueryParam();
  }

  const form = open ? (
    <ConsumptionForm
      projectId={projectId}
      products={products}
      warehouses={warehouses}
      wbsOptions={wbsOptions}
      variant="plain"
      onCancel={closeDialog}
      onSuccess={handleSuccess}
    />
  ) : null;

  const trigger = (
    <Button className="min-h-11 md:min-h-9">Registrar consumo</Button>
  );

  if (useSheet) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) clearCreateQueryParam();
        }}
      >
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Registrar consumo</SheetTitle>
            <SheetDescription className="sr-only">
              Completá los datos para registrar un consumo de inventario del proyecto.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{form}</div>
        </SheetContent>
      </Sheet>
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar consumo</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos para registrar un consumo de inventario del proyecto.
          </DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
