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
import { ManualInvoiceForm, type ClientOption } from "./manual-invoice-form";

interface Props {
  projectId: string;
  clients: ClientOption[];
  storageConfigured?: boolean;
  defaultOpen?: boolean;
}

export function NewProjectSalesInvoiceDialog({
  projectId,
  clients,
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
        <Button size="sm">Nueva factura</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva factura emitida</DialogTitle>
          <DialogDescription className="sr-only">
            Completá los datos para emitir una factura del proyecto.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ManualInvoiceForm
            projectId={projectId}
            clients={clients}
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
