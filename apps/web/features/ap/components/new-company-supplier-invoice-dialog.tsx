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
import { SupplierInvoiceForm, type SupplierOption } from "./supplier-invoice-form";

interface Props {
  suppliers: SupplierOption[];
  defaultOpen?: boolean;
}

export function NewCompanySupplierInvoiceDialog({ suppliers, defaultOpen = false }: Props) {
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearCreateQueryParam();
      }}
    >
      <DialogTrigger asChild>
        <Button>Nueva factura</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva factura de gasto</DialogTitle>
          <DialogDescription>
            Registrá una factura corporativa sin proyecto. Quedará en borrador para revisión.
          </DialogDescription>
        </DialogHeader>
        <SupplierInvoiceForm
          companyFinanzas
          suppliers={suppliers}
          poOptions={[]}
          variant="plain"
          onCancel={closeDialog}
          onSuccess={closeDialog}
        />
      </DialogContent>
    </Dialog>
  );
}
