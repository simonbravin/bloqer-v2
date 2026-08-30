"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, toSearchableOptions } from "@/lib/searchable-options";
import { SettlementFields } from "@/features/treasury/components/settlement-fields";
import type { SettlementMethodValue } from "@/features/treasury/lib/settlement-method-label";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { classifySalesInvoice } from "@bloqer/domain";
import { registerArAdvanceAction } from "@/app/(app)/proyectos/[id]/facturas/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { DocumentClassCreateHint } from "@/features/finance/components/document-class-badge";
import type { ClientOption } from "./manual-invoice-form";

type TreasuryAccountOption = {
  id: string;
  name: string;
  currency: string;
};

interface Props {
  projectId: string;
  clients: ClientOption[];
  accounts: TreasuryAccountOption[];
  defaultClientId?: string;
}

export function AdvanceInvoiceForm({
  projectId,
  clients,
  accounts,
  defaultClientId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientContactId, setClientContactId] = useState(defaultClientId ?? "");
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SettlementMethodValue | "">("");
  const [amount, setAmount] = useState("");
  const { idempotencyKey: saleKey, rotateIdempotencyKey: rotateSaleKey } = useIdempotencyKey();
  const { idempotencyKey: collectNowKey, rotateIdempotencyKey: rotateCollectNowKey } =
    useIdempotencyKey();

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );
  const currency = selectedAccount?.currency ?? "ARS";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientContactId) {
      setError("Debe seleccionar un cliente");
      return;
    }
    if (!accountId) {
      setError("Debe seleccionar una cuenta de tesorería");
      return;
    }
    if (!selectedAccount) {
      setError("Cuenta de tesorería inválida");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const issueDate = fd.get("issueDate") as string;
    const collectionDate = fd.get("collectionDate") as string;
    const amount = fd.get("amount") as string;

    startTransition(async () => {
      const res = await registerArAdvanceAction(projectId, {
        projectId,
        clientContactId,
        issueDate,
        dueDate: issueDate,
        currency: selectedAccount.currency,
        amount,
        notes: (fd.get("notes") as string) || null,
        idempotencyKey: saleKey,
        collectNow: {
          accountId,
          collectionDate,
          collectFullBalance: true,
          notes: "Cobro de anticipo",
          paymentMethod: paymentMethod || null,
          reference: String(fd.get("reference") ?? "").trim() || null,
          idempotencyKey: collectNowKey,
        },
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        rotateSaleKey();
        rotateCollectNowKey();
        router.push(`/proyectos/${projectId}/facturas/${res.invoiceId}`);
      }
    });
  }

  const today = toIsoDateInTimeZone();

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Emite factura de anticipo, genera la cuenta por cobrar y registra el cobro en una sola operación.
        Mejora la caja imputada del proyecto desde el inicio de la obra.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : null}

        <DocumentClassCreateHint
          classLabel={classifySalesInvoice({ projectId }).classLabel}
          classFamily={classifySalesInvoice({ projectId }).family}
          hint="Anticipo de obra: se etiqueta como venta de obra (sin señal persistida aparte)."
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Cliente</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay clientes activos. Cree un contacto con rol Cliente primero.
              </p>
            ) : (
              <SearchableCombobox
                popoverWidth="wide"
                options={toSearchableOptions(clients)}
                value={clientContactId}
                onValueChange={setClientContactId}
                placeholder="Seleccionar cliente…"
                searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
                emptyText="Ningún cliente coincide."
              />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de factura</Label>
            <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="collectionDate">Fecha de cobro</Label>
            <Input
              id="collectionDate"
              name="collectionDate"
              type="date"
              defaultValue={today}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Cuenta de cobro</Label>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay cuentas de tesorería activas.</p>
            ) : (
              <SearchableCombobox
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${a.currency})`,
                }))}
                value={accountId}
                onValueChange={setAccountId}
                placeholder="Seleccionar cuenta…"
                searchPlaceholder="Buscar cuenta…"
                emptyText="Ninguna cuenta coincide."
              />
            )}
            {!accountId ? (
              <p className="text-xs text-muted-foreground">
                Seleccioná una cuenta para definir la moneda del anticipo.
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">
              Monto del anticipo ({currency})
            </Label>
            <DecimalInput
              id="amount"
              name="amount"
              value={amount}
              onValueChange={setAmount}
              placeholder="0,00"
              required
              disabled={!accountId}
            />
          </div>

          <div className="col-span-2">
            <SettlementFields
              idPrefix="advance"
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Referencia contractual, etc." />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending || clients.length === 0 || accounts.length === 0 || !accountId}
        >
          {isPending ? "Registrando…" : "Registrar anticipo y cobro"}
        </Button>
      </form>
    </div>
  );
}
