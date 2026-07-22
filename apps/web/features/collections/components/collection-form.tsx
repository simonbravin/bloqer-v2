"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { roundMoney, serializeMoney } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FillableAmount } from "@/components/ui/fillable-amount";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCollectionAction } from "@/app/(app)/proyectos/[id]/cobranzas/actions";
import { createCompanyCollectionAction } from "@/app/(app)/finanzas/cuentas-por-cobrar/actions";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  /** Required when `companyFinanzas` is false */
  projectId?: string;
  companyFinanzas?: boolean;
  receivableId: string;
  receivableBalance: string;
  receivableCurrency: string;
  accounts: AccountOption[];
}

export function CollectionForm({
  projectId,
  companyFinanzas = false,
  receivableId,
  receivableBalance,
  receivableCurrency,
  accounts,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");

  const matchingAccounts = accounts.filter((a) => a.currency === receivableCurrency);
  const balanceSerialized = serializeMoney(receivableBalance);
  const [amount, setAmount] = useState(balanceSerialized);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  function fillAmount(next: string) {
    setAmount(serializeMoney(next));
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 900);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accountId) { setError("Seleccione una cuenta de tesorería"); return; }
    if (!companyFinanzas && !projectId) {
      setError("Falta el proyecto");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const rawAmount = String(fd.get("amount") ?? "").trim();
    let rounded: string;
    try {
      rounded = roundMoney(rawAmount);
    } catch {
      setError("Monto inválido");
      return;
    }
    // D-053: full balance uses stored balanceDue server-side (avoid round-then-reapply).
    const collectFullBalance =
      rounded === balanceSerialized ||
      rawAmount === receivableBalance ||
      rawAmount === balanceSerialized;
    const payload = {
      receivableId,
      accountId,
      collectionDate: fd.get("collectionDate") as string,
      amount: collectFullBalance ? undefined : rounded,
      collectFullBalance: collectFullBalance || undefined,
      notes: (fd.get("notes") as string) || null,
    };
    startTransition(async () => {
      const res = companyFinanzas
        ? await createCompanyCollectionAction(payload)
        : await createCollectionAction(projectId!, payload);
      if ("error" in res) {
        setError(res.error);
      } else if (companyFinanzas) {
        router.push(`/finanzas/cuentas-por-cobrar/${receivableId}`);
      } else {
        router.push(`/proyectos/${projectId}/cuentas-por-cobrar/${receivableId}`);
      }
    });
  }

  if (matchingAccounts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No hay cuentas de tesorería activas en {receivableCurrency}. Cree una cuenta con esa moneda primero.
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
            <Label htmlFor="collection-account">Cuenta de tesorería ({receivableCurrency})</Label>
            <Select onValueChange={setAccountId} value={accountId}>
              <SelectTrigger id="collection-account">
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent>
                {matchingAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="collectionDate">Fecha de cobro</Label>
            <Input id="collectionDate" name="collectionDate" type="date" required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">Monto ({receivableCurrency})</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              max={balanceSerialized}
              className={cn(flash && "ring-2 ring-primary transition-shadow")}
            />
            <FillableAmount
              className="pt-1"
              onPick={(v) => fillAmount(v)}
              toastOnPick={() => "Monto completado con el saldo pendiente."}
              suggestions={[
                {
                  label: "Saldo pendiente",
                  amount: receivableBalance,
                  currency: receivableCurrency,
                },
              ]}
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
            {isPending ? "Guardando…" : "Registrar cobro"}
          </Button>
        </div>
      </form>
    </div>
  );
}
