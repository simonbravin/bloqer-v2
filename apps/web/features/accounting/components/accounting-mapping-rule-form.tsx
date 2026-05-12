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
import {
  createAccountingMappingRuleAction,
  updateAccountingMappingRuleAction,
} from "@/app/(app)/contabilidad/actions";
import type { AccountingMappingEventType } from "@bloqer/database";
import type { AccountingMappingRuleView } from "@bloqer/services";
import type { AccountPick } from "./journal-entry-lines-editor";
import { ACCOUNTING_EVENT_TYPE_OPTIONS } from "./accounting-event-type-badge";

interface Props {
  mode: "create" | "edit";
  ruleId?: string;
  initial?: AccountingMappingRuleView;
  accounts: AccountPick[];
  defaultCompanyId?: string | null;
}

export function AccountingMappingRuleForm({
  mode,
  ruleId,
  initial,
  accounts,
  defaultCompanyId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState<AccountingMappingEventType | "">(
    () => initial?.eventType ?? "",
  );
  const [debitId, setDebitId] = useState(initial?.debitAccountId ?? "");
  const [creditId, setCreditId] = useState(initial?.creditAccountId ?? "");
  const companyId = initial?.companyId ?? defaultCompanyId ?? "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!eventType) {
      setError("Seleccioná el tipo de evento");
      return;
    }
    if (!debitId || !creditId) {
      setError("Elegí cuenta debe y haber");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const priority = Number(fd.get("priority") ?? 100);
      if (mode === "create") {
        const res = await createAccountingMappingRuleAction({
          companyId:       companyId || null,
          eventType:       eventType as AccountingMappingEventType,
          name:            (fd.get("name") as string).trim(),
          description:     (fd.get("description") as string)?.trim() || null,
          debitAccountId:  debitId,
          creditAccountId: creditId,
          priority:        Number.isFinite(priority) ? priority : 100,
          metadata:        null,
        });
        if ("error" in res) setError(res.error);
        else router.push(`/contabilidad/reglas/${res.id}`);
      } else if (ruleId) {
        const res = await updateAccountingMappingRuleAction(ruleId, {
          eventType:       eventType as AccountingMappingEventType,
          name:            (fd.get("name") as string).trim(),
          description:     (fd.get("description") as string)?.trim() || null,
          debitAccountId:  debitId,
          creditAccountId: creditId,
          priority:        Number.isFinite(priority) ? priority : undefined,
          companyId:       initial?.companyId ?? null,
        });
        if ("error" in res) setError(res.error);
        else router.push(`/contabilidad/reglas/${ruleId}`);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="space-y-1">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" required maxLength={256} defaultValue={initial?.name ?? ""} />
        </div>

        <div className="space-y-1">
          <Label>Tipo de evento</Label>
          <Select value={eventType || undefined} onValueChange={(v) => setEventType(v as AccountingMappingEventType)}>
            <SelectTrigger><SelectValue placeholder="Evento…" /></SelectTrigger>
            <SelectContent>
              {ACCOUNTING_EVENT_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Cuenta debe</Label>
            <Select value={debitId || undefined} onValueChange={setDebitId}>
              <SelectTrigger><SelectValue placeholder="Cuenta…" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cuenta haber</Label>
            <Select value={creditId || undefined} onValueChange={setCreditId}>
              <SelectTrigger><SelectValue placeholder="Cuenta…" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="priority">Prioridad (menor = primero)</Label>
          <Input id="priority" name="priority" type="number" defaultValue={initial?.priority ?? 100} min={0} max={1000000} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <Textarea id="description" name="description" rows={2} maxLength={1024} defaultValue={initial?.description ?? ""} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : mode === "create" ? "Crear regla" : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
