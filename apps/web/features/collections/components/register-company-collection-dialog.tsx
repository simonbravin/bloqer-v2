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
import { CollectionForm } from "./collection-form";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  receivableId: string;
  receivableBalance: string;
  receivableCurrency: string;
  accounts: AccountOption[];
  defaultOpen?: boolean;
}

export function RegisterCompanyCollectionDialog({
  receivableId,
  receivableBalance,
  receivableCurrency,
  accounts,
  defaultOpen = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  function cobrarQueryHrefWithoutFlag() {
    if (searchParams.get("cobrar") !== "1") return null;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("cobrar");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function clearCobrarQueryParam() {
    const href = cobrarQueryHrefWithoutFlag();
    if (!href) return;
    router.replace(href, { scroll: false });
  }

  function stripCobrarFromHistory() {
    const href = cobrarQueryHrefWithoutFlag();
    if (!href) return;
    window.history.replaceState(window.history.state, "", href);
  }

  function closeDialog() {
    setOpen(false);
    clearCobrarQueryParam();
  }

  function handleSuccess() {
    setOpen(false);
    stripCobrarFromHistory();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearCobrarQueryParam();
      }}
    >
      <DialogTrigger asChild>
        <Button>Registrar cobranza</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar cobro (empresa)</DialogTitle>
          <DialogDescription>
            Elegí la cuenta de tesorería. El crédito se registra al confirmar el cobro.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CollectionForm
            companyFinanzas
            receivableId={receivableId}
            receivableBalance={receivableBalance}
            receivableCurrency={receivableCurrency}
            accounts={accounts}
            variant="plain"
            onCancel={closeDialog}
            onSuccess={handleSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
