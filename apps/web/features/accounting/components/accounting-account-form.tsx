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
import { createAccountingAccountAction } from "@/app/(app)/contabilidad/actions";
import type { AccountType } from "@bloqer/database";

export interface CompanyOption {
  id:   string;
  name: string;
}

interface Props {
  companies?: CompanyOption[];
  defaultCompanyId?: string | null;
}

export function AccountingAccountForm({ companies, defaultCompanyId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<AccountType | "">("");
  const [companyId, setCompanyId] = useState<string>(
    defaultCompanyId ?? companies?.[0]?.id ?? "",
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!type) {
      setError("Seleccioná el tipo de cuenta");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAccountingAccountAction({
        companyId:   companyId || null,
        code:        (fd.get("code") as string).trim(),
        name:        (fd.get("name") as string).trim(),
        type:        type as AccountType,
        parentId:    null,
        description: (fd.get("description") as string)?.trim() || null,
      });
      if ("error" in res) setError(res.error);
      else router.push("/contabilidad/cuentas");
    });
  }

  const showCompany = (companies?.length ?? 0) > 1;

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {showCompany && (
          <div className="space-y-1">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Empresa…" />
              </SelectTrigger>
              <SelectContent>
                {companies!.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="code">Código</Label>
            <Input id="code" name="code" required maxLength={64} className="font-mono" placeholder="Ej. 1.1.01" />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ASSET">Activo</SelectItem>
                <SelectItem value="LIABILITY">Pasivo</SelectItem>
                <SelectItem value="EQUITY">Patrimonio</SelectItem>
                <SelectItem value="INCOME">Ingreso</SelectItem>
                <SelectItem value="EXPENSE">Gasto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required maxLength={256} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea id="description" name="description" rows={2} maxLength={1024} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>{isPending ? "Guardando…" : "Crear cuenta"}</Button>
        </div>
      </form>
    </div>
  );
}
