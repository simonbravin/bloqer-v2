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
import { createTreasuryAccountAction } from "@/app/(app)/tesoreria/actions";

interface Props {
  accounts?: never;
}

export function TreasuryAccountForm(_props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!type) { setError("Debe seleccionar un tipo de cuenta"); return; }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createTreasuryAccountAction({
        name:           fd.get("name") as string,
        type:           type as "BANK" | "CASH" | "DIGITAL_WALLET" | "OTHER",
        currency:       (fd.get("currency") as string) || "ARS",
        bankName:       (fd.get("bankName") as string) || null,
        accountNumber:  (fd.get("accountNumber") as string) || null,
        alias:          (fd.get("alias") as string) || null,
        openingBalance: (fd.get("openingBalance") as string) || "0",
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
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required placeholder="Ej. Caja chica oficina" />
          </div>

          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select onValueChange={setType} value={type}>
              <SelectTrigger>
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
            <Input id="currency" name="currency" defaultValue="ARS" maxLength={3} />
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
            <Input
              id="openingBalance"
              name="openingBalance"
              defaultValue="0"
              placeholder="0.00"
              pattern="^\d+(\.\d+)?$"
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
            {isPending ? "Guardando…" : "Crear cuenta"}
          </Button>
        </div>
      </form>
    </div>
  );
}
