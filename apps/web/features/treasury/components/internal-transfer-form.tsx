"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createInternalTransferAction } from "@/app/(app)/tesoreria/actions";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  accounts: AccountOption[];
}

export function InternalTransferForm({ accounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sourceAccountId) { setError("Seleccione cuenta origen"); return; }
    if (!destinationAccountId) { setError("Seleccione cuenta destino"); return; }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createInternalTransferAction({
        sourceAccountId,
        destinationAccountId,
        transferDate: fd.get("transferDate") as string,
        amount:       fd.get("amount") as string,
        description:  (fd.get("description") as string) || null,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push("/tesoreria/transferencias");
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
          <div className="space-y-1">
            <Label>Cuenta origen</Label>
            <Select onValueChange={setSourceAccountId} value={sourceAccountId}>
              <SelectTrigger>
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

          <div className="space-y-1">
            <Label>Cuenta destino</Label>
            <Select onValueChange={setDestinationAccountId} value={destinationAccountId}>
              <SelectTrigger>
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

          <div className="space-y-1">
            <Label htmlFor="transferDate">Fecha</Label>
            <Input id="transferDate" name="transferDate" type="date" required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">Monto</Label>
            <Input
              id="amount"
              name="amount"
              required
              placeholder="0.00"
              pattern="^\d+(\.\d+)?$"
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Input id="description" name="description" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || accounts.length < 2}>
            {isPending ? "Guardando…" : "Crear transferencia"}
          </Button>
        </div>
      </form>
    </div>
  );
}
