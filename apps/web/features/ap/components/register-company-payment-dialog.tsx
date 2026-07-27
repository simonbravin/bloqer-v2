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
import { PaymentForm } from "./payment-form";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  payableId: string;
  payableBalance: string;
  payableCurrency: string;
  accounts: AccountOption[];
  defaultOpen?: boolean;
}

export function RegisterCompanyPaymentDialog({
  payableId,
  payableBalance,
  payableCurrency,
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

  function pagarQueryHrefWithoutFlag() {
    if (searchParams.get("pagar") !== "1") return null;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("pagar");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function clearPagarQueryParam() {
    const href = pagarQueryHrefWithoutFlag();
    if (!href) return;
    router.replace(href, { scroll: false });
  }

  /**
   * Strip `?pagar=1` from the current history entry without racing the form's
   * `router.push` to the payment detail (back would otherwise re-open the dialog).
   */
  function stripPagarFromHistory() {
    const href = pagarQueryHrefWithoutFlag();
    if (!href) return;
    window.history.replaceState(window.history.state, "", href);
  }

  function closeDialog() {
    setOpen(false);
    clearPagarQueryParam();
  }

  function handleSuccess() {
    setOpen(false);
    stripPagarFromHistory();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearPagarQueryParam();
      }}
    >
      <DialogTrigger asChild>
        <Button>Registrar pago</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar pago (empresa)</DialogTitle>
          <DialogDescription>
            Elegí la cuenta de tesorería. El débito se registra al confirmar el pago.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PaymentForm
            companyFinanzas
            payableId={payableId}
            payableBalance={payableBalance}
            payableCurrency={payableCurrency}
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
