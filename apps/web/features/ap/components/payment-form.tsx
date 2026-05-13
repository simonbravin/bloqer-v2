"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createPaymentAction } from "@/app/(app)/proyectos/[id]/cuentas-por-pagar/actions";
import { createCompanyPaymentAction } from "@/app/(app)/finanzas/cuentas-por-pagar/actions";

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
  /** Project workspace */
  projectId?: string;
  companyFinanzas?: boolean;
}

export function PaymentForm({
  projectId,
  companyFinanzas = false,
  payableId,
  payableBalance,
  payableCurrency,
  accounts,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");

  const matchingAccounts = accounts.filter((a) => a.currency === payableCurrency);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accountId) { setError("Seleccione una cuenta de tesorería"); return; }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      if (companyFinanzas) {
        const res = await createCompanyPaymentAction({
          payableId,
          accountId,
          paymentDate: fd.get("paymentDate") as string,
          amount:      fd.get("amount") as string,
          notes:       (fd.get("notes") as string) || null,
        });
        if ("error" in res) {
          setError(res.error);
        } else {
          router.push(`/finanzas/pagos-proveedor/${res.id}`);
        }
        return;
      }
      if (!projectId) {
        setError("Configuración inválida del formulario");
        return;
      }
      const res = await createPaymentAction(projectId, {
        payableId,
        accountId,
        paymentDate: fd.get("paymentDate") as string,
        amount:      fd.get("amount") as string,
        notes:       (fd.get("notes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/cuentas-por-pagar/${payableId}`);
      }
    });
  }

  if (matchingAccounts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No hay cuentas de tesorería activas en {payableCurrency}. Cree una cuenta con esa moneda primero.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Cuenta de tesorería ({payableCurrency})</Label>
            <Select onValueChange={setAccountId} value={accountId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent>
                {matchingAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="paymentDate">Fecha de pago</Label>
            <Input id="paymentDate" name="paymentDate" type="date" required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">
              Monto (máx. {payableBalance} {payableCurrency})
            </Label>
            <Input
              id="amount"
              name="amount"
              required
              placeholder="0.00"
              pattern="^\d+(\.\d+)?$"
              max={payableBalance}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Registrar pago"}
          </Button>
        </div>
      </form>
    </div>
  );
}
