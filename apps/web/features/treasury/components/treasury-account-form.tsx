"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createTreasuryAccountAction } from "@/app/(app)/tesoreria/actions";
import { CurrencySelect } from "@/components/ui/currency-select";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";
import { isZeroMoneyAmount } from "@/lib/format-money";
import { useOperationalAction } from "@/hooks/use-operational-action";

interface Props {
  accounts?: never;
}

export function TreasuryAccountForm(_props: Props) {
  void _props;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending: isPending, run, isBusy } = useOperationalAction({ onError: setError });
  const [type, setType] = useState<string>("");
  const [currency, setCurrency] = useState("ARS");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingFxRate, setOpeningFxRate] = useState("");
  const needsFx = currency !== "ARS" && !isZeroMoneyAmount(openingBalance);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy()) return;
    if (!type) { setError("Seleccioná un tipo de cuenta"); return; }
    const fd = new FormData(e.currentTarget);
    setError(null);
    void run(async () => {
      const res = await createTreasuryAccountAction({
        name:           fd.get("name") as string,
        type:           type as "BANK" | "CASH" | "DIGITAL_WALLET" | "OTHER",
        currency,
        bankName:       (fd.get("bankName") as string) || null,
        accountNumber:  (fd.get("accountNumber") as string) || null,
        alias:          (fd.get("alias") as string) || null,
        openingBalance: (fd.get("openingBalance") as string) || "0",
        openingFxRate:  needsFx ? openingFxRate : undefined,
        notes:          (fd.get("notes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push("/tesoreria/cuentas");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required placeholder="Ej. Caja chica oficina" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="treasury-account-type">Tipo</Label>
            <Select onValueChange={setType} value={type}>
              <SelectTrigger id="treasury-account-type">
                <SelectValue placeholder="Seleccionar tipo…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK">Banco</SelectItem>
                <SelectItem value="CASH">Caja</SelectItem>
                <SelectItem value="DIGITAL_WALLET">Billetera</SelectItem>
                <SelectItem value="OTHER">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="currency">Moneda</Label>
            <CurrencySelect id="currency" value={currency} onValueChange={(next) => {
              setCurrency(next);
              setOpeningFxRate("");
            }} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bankName">Banco (opcional)</Label>
            <Input id="bankName" name="bankName" placeholder="Ej. Banco Nación" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="accountNumber">N° de cuenta (opcional)</Label>
            <Input id="accountNumber" name="accountNumber" placeholder="Ej. 0000000/1" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="alias">Alias (opcional)</Label>
            <Input id="alias" name="alias" placeholder="Ej. cuenta.obra.principal" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="openingBalance">Saldo inicial</Label>
            <DecimalInput
              id="openingBalance"
              name="openingBalance"
              value={openingBalance}
              onValueChange={setOpeningBalance}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              Si el saldo inicial es distinto de cero, necesitás una empresa en el contexto de tu membresía
              (el período financiero se valida contra esa empresa).
            </p>
          </div>
          {needsFx ? (
            <ManualFxField currency={currency} value={openingFxRate} onValueChange={setOpeningFxRate} id="opening-fx-rate" disabled={isPending} />
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Crear cuenta"}
          </Button>
        </div>
      </form>
    </div>
  );
}
