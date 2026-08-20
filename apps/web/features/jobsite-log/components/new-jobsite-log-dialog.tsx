"use client";

import { useEffect, useState } from "react";
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
import { JobsiteLogCreateComposer } from "./jobsite-log-create-composer";
import type {
  ContactOption,
  ProductOption,
  SubcontractOption,
  WarehouseOption,
  WbsItemOption,
} from "./jobsite-log-form";
import type { WbsIncrementalProgressSnapshot } from "@bloqer/services";

interface Props {
  projectId: string;
  companyId: string;
  wbsOptions: WbsItemOption[];
  contactOptions: ContactOption[];
  productOptions: ProductOption[];
  warehouseOptions: WarehouseOption[];
  subcontractOptions: SubcontractOption[];
  wbsProgressSnapshot?: WbsIncrementalProgressSnapshot;
  inventoryModuleEnabled?: boolean;
  legacyPhysicalPctWarning?: boolean;
  stockPreviewAction?: (warehouseId: string, productId: string) => Promise<{ balance?: string; error?: string }>;
  action: (fd: FormData) => Promise<{ error: string } | { id: string }>;
  defaultOpen?: boolean;
  triggerLabel?: string;
}

export function NewJobsiteLogDialog({
  projectId,
  companyId,
  wbsOptions,
  contactOptions,
  productOptions,
  warehouseOptions,
  subcontractOptions,
  wbsProgressSnapshot,
  inventoryModuleEnabled,
  legacyPhysicalPctWarning,
  stockPreviewAction,
  action,
  defaultOpen = false,
  triggerLabel = "+ Nuevo parte",
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);
  const hasMounted = useHasMounted();
  const isMdUp = useIsMdUp();
  const nuevoHref = `/proyectos/${projectId}/libro-obra/nuevo`;

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!hasMounted || isMdUp || !defaultOpen) return;
    router.replace(nuevoHref);
  }, [hasMounted, isMdUp, defaultOpen, router, nuevoHref]);

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
  }

  if (hasMounted && !isMdUp) {
    return (
      <Button asChild className="min-h-11">
        <Link href={nuevoHref}>{triggerLabel}</Link>
      </Button>
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
      <DialogTrigger asChild>
        <Button className="min-h-11 md:min-h-9">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nuevo parte de obra</DialogTitle>
          <DialogDescription className="sr-only">
            Completá el encabezado, avance e incidencias del parte diario.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <JobsiteLogCreateComposer
            projectId={projectId}
            companyId={companyId}
            wbsOptions={wbsOptions}
            contactOptions={contactOptions}
            productOptions={productOptions}
            warehouseOptions={warehouseOptions}
            subcontractOptions={subcontractOptions}
            wbsProgressSnapshot={wbsProgressSnapshot}
            inventoryModuleEnabled={inventoryModuleEnabled}
            legacyPhysicalPctWarning={legacyPhysicalPctWarning}
            stockPreviewAction={stockPreviewAction}
            action={action}
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
