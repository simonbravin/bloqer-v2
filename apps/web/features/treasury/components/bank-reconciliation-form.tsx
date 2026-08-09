"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBankReconciliationAction } from "@/app/(app)/tesoreria/conciliacion/actions";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  accounts: AccountOption[];
}

export function BankReconciliationForm({ accounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accountId) {
      setError("Seleccioná una cuenta");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createBankReconciliationAction({
        accountId,
        periodStart: fd.get("periodStart") as string,
        periodEnd: fd.get("periodEnd") as string,
        openingBalance: String(fd.get("openingBalance") ?? "").trim(),
        closingBalance: String(fd.get("closingBalance") ?? "").trim(),
        notes: (fd.get("notes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/tesoreria/conciliacion/${res.id}`);
    });
  }

  if (accounts.length === 0) {
    return (
      <ListEmptyState
        title="No hay cuentas de tesorería activas"
        description="Creá una cuenta antes de iniciar una conciliación."
        action={
          <Button asChild size="sm">
            <Link href="/tesoreria/cuentas/nueva">Nueva cuenta</Link>
          </Button>
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-6">
      {error && (
        <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="recon-account">Cuenta</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="recon-account">
            <SelectValue placeholder="Seleccionar cuenta…" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="periodStart">Desde</Label>
          <Input id="periodStart" name="periodStart" type="date" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodEnd">Hasta</Label>
          <Input id="periodEnd" name="periodEnd" type="date" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="openingBalance">Saldo inicial (extracto)</Label>
          <Input
            id="openingBalance"
            name="openingBalance"
            inputMode="decimal"
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="closingBalance">Saldo final (extracto)</Label>
          <Input
            id="closingBalance"
            name="closingBalance"
            inputMode="decimal"
            placeholder="0.00"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando…" : "Crear conciliación"}
        </Button>
      </div>
    </form>
  );
}
