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
  SupplierInvoiceForm,
  type POOption,
  type SupplierOption,
  type TreasuryAccountOption,
} from "./supplier-invoice-form";
import type { InvoiceWbsOption } from "./invoice-lines-editor";

interface Props {
  projectId: string;
  suppliers: SupplierOption[];
  poOptions: POOption[];
  wbsOptions: InvoiceWbsOption[];
  treasuryAccounts?: TreasuryAccountOption[];
  canPayNow?: boolean;
  storageConfigured?: boolean;
  defaultOpen?: boolean;
}

export function NewProjectSupplierInvoiceDialog({
  projectId,
  suppliers,
  poOptions,
  wbsOptions,
  treasuryAccounts = [],
  canPayNow = false,
  storageConfigured = false,
  defaultOpen = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  function clearCreateQueryParams() {
    const hasCreate = searchParams.get("create") === "1";
    const hasError = Boolean(searchParams.get("error"));
    if (!hasCreate && !hasError) return;

    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    next.delete("error");
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
        <Button size="sm">Nueva factura</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva factura de proveedor</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos para registrar una factura de proveedor del proyecto.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <SupplierInvoiceForm
            projectId={projectId}
            suppliers={suppliers}
            poOptions={poOptions}
            wbsOptions={wbsOptions}
            treasuryAccounts={treasuryAccounts}
            canPayNow={canPayNow}
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
