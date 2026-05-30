"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";
import { registerArAdvanceAction } from "@/app/(app)/proyectos/[id]/facturas/actions";
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
        collectNow: {
          accountId,
          collectionDate,
          amount,
          notes: "Cobro de anticipo",
        },
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/facturas/${res.invoiceId}`);
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

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

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Cliente</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay clientes activos. Cree un contacto con rol Cliente primero.
              </p>
            ) : (
              <SearchableCombobox
                options={toSearchableOptions(clients)}
                value={clientContactId}
                onValueChange={setClientContactId}
                placeholder="Seleccionar cliente…"
                searchPlaceholder="Buscar cliente…"
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
            <Input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              required
              disabled={!accountId}
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
