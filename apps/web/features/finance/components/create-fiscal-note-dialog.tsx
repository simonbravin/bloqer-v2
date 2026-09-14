"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { compareDecimal, serializeMoney } from "@bloqer/utils";
import { FISCAL_DOCUMENT_KIND_LABELS } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DecimalInput } from "@/components/ui/decimal-input";
import { FillableAmount } from "@/components/ui/fillable-amount";
import { formatMoneyAmount } from "@/lib/format-money";
import { createSalesCreditNoteFromInvoiceAction, createSalesDebitNoteFromInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas/actions";
import {
  createCompanySalesCreditNoteFromInvoiceAction,
  createCompanySalesDebitNoteFromInvoiceAction,
} from "@/app/(app)/finanzas/facturas/actions";
import {
  createSupplierCreditNoteFromInvoiceAction,
  createSupplierDebitNoteFromInvoiceAction,
} from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import {
  createCompanySupplierCreditNoteFromInvoiceAction,
  createCompanySupplierDebitNoteFromInvoiceAction,
} from "@/app/(app)/finanzas/facturas-proveedor/actions";

export type CreateFiscalNoteScope =
  | { type: "project-ar"; projectId: string }
  | { type: "company-ar" }
  | { type: "project-ap"; projectId: string }
  | { type: "company-ap" };

type Props = {
  kind: "CREDIT_NOTE" | "DEBIT_NOTE";
  parentInvoiceId: string;
  parentCode: string;
  currency: string;
  /** Open balance of parent CxC/CxP — required for NC. */
  openBalance?: string;
  scope: CreateFiscalNoteScope;
  triggerLabel?: string;
  triggerVariant?: "outline" | "secondary" | "default";
  triggerSize?: "sm" | "default";
};

type CreateResult = { id: string } | { error: string };

export function CreateFiscalNoteDialog({
  kind,
  parentInvoiceId,
  parentCode,
  currency,
  openBalance,
  scope,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isCredit = kind === "CREDIT_NOTE";
  const balanceSerialized = openBalance ? serializeMoney(openBalance) : "0.00";
  const [amount, setAmount] = useState(balanceSerialized);
  const kindLabel = FISCAL_DOCUMENT_KIND_LABELS[kind];
  const buttonLabel = triggerLabel ?? (isCredit ? "Nota de crédito" : "Nota de débito");

  function detailHref(noteId: string): string {
    switch (scope.type) {
      case "project-ar":
        return `/proyectos/${scope.projectId}/facturas/${noteId}`;
      case "company-ar":
        return `/finanzas/facturas/${noteId}`;
      case "project-ap":
        return `/proyectos/${scope.projectId}/facturas-proveedor/${noteId}`;
      case "company-ap":
        return `/finanzas/facturas-proveedor/${noteId}`;
    }
  }

  async function runCreate(amountValue?: string): Promise<CreateResult> {
    const payload = amountValue ? { amount: amountValue } : undefined;
    switch (scope.type) {
      case "project-ar":
        return isCredit
          ? createSalesCreditNoteFromInvoiceAction(parentInvoiceId, scope.projectId, payload)
          : createSalesDebitNoteFromInvoiceAction(parentInvoiceId, scope.projectId);
      case "company-ar":
        return isCredit
          ? createCompanySalesCreditNoteFromInvoiceAction(parentInvoiceId, payload)
          : createCompanySalesDebitNoteFromInvoiceAction(parentInvoiceId);
      case "project-ap":
        return isCredit
          ? createSupplierCreditNoteFromInvoiceAction(parentInvoiceId, scope.projectId, payload)
          : createSupplierDebitNoteFromInvoiceAction(parentInvoiceId, scope.projectId);
      case "company-ap":
        return isCredit
          ? createCompanySupplierCreditNoteFromInvoiceAction(parentInvoiceId, payload)
          : createCompanySupplierDebitNoteFromInvoiceAction(parentInvoiceId);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isCredit) {
      const normalized = serializeMoney(amount);
      if (compareDecimal(normalized, "0") <= 0) {
        setError("Ingresá un monto mayor a cero");
        return;
      }
      if (compareDecimal(normalized, balanceSerialized) > 0) {
        setError(
          `El monto no puede superar el saldo pendiente (${formatMoneyAmount(balanceSerialized, currency)}).`,
        );
        return;
      }
      startTransition(async () => {
        const result = await runCreate(normalized);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.push(detailHref(result.id));
      });
      return;
    }
    startTransition(async () => {
      const result = await runCreate();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(detailHref(result.id));
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setAmount(balanceSerialized);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kindLabel}</DialogTitle>
          <DialogDescription>
            {isCredit
              ? `Sobre ${parentCode}. Reducí el saldo sin movimiento de caja. Podés dejar el total o una NC parcial.`
              : `Sobre ${parentCode}. Se crea un borrador que, al emitir, abre una obligación adicional.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          {isCredit ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Saldo pendiente</span>
                <span className="font-mono font-medium">
                  {formatMoneyAmount(balanceSerialized, currency)}
                </span>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fiscal-note-amount">Monto de la NC</Label>
                <DecimalInput
                  id="fiscal-note-amount"
                  value={amount}
                  onValueChange={setAmount}
                  required
                />
                <FillableAmount
                  suggestions={[
                    {
                      label: "Saldo",
                      amount: balanceSerialized,
                      currency,
                    },
                  ]}
                  onPick={(next) => setAmount(next)}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              El borrador copia las líneas de la factura. Después podés editarlas antes de emitir.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                (isCredit && (!openBalance || compareDecimal(balanceSerialized, "0") <= 0))
              }
            >
              {isPending ? "Creando…" : "Crear borrador"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
