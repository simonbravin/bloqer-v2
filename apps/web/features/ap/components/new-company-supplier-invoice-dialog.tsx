"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SupplierInvoiceForm, type SupplierOption } from "./supplier-invoice-form";

interface Props {
  suppliers: SupplierOption[];
  companyCountry?: string | null;
  companyIvaCondition?: string | null;
  defaultOpen?: boolean;
  storageConfigured?: boolean;
}

export function NewCompanySupplierInvoiceDialog({
  suppliers,
  companyCountry,
  companyIvaCondition,
  defaultOpen = false,
  storageConfigured = false,
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
        <Button>Nueva factura</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva factura de gasto</DialogTitle>
        </DialogHeader>
        {open ? (
          <SupplierInvoiceForm
            companyFinanzas
            suppliers={suppliers}
            companyCountry={companyCountry}
            companyIvaCondition={companyIvaCondition}
            poOptions={[]}
            storageConfigured={storageConfigured}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
