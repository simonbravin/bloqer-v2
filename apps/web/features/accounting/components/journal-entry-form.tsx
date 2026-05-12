"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  createJournalEntryAction,
  updateJournalEntryAction,
} from "@/app/(app)/contabilidad/actions";
import type { JournalEntryView } from "@bloqer/services";
import type { CompanyOption } from "./accounting-account-form";
import {
  JournalEntryLinesEditor,
  initialJournalLines,
  linesFromJournalEntry,
  type AccountPick,
  type LineEditorRow,
} from "./journal-entry-lines-editor";

interface Props {
  mode: "create" | "edit";
  accounts: AccountPick[];
  companies?: CompanyOption[];
  defaultCompanyId?: string | null;
  entryId?: string;
  initial?: JournalEntryView;
}

export function JournalEntryForm({
  mode,
  accounts,
  companies,
  defaultCompanyId,
  entryId,
  initial,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(
    () => initial?.companyId ?? defaultCompanyId ?? companies?.[0]?.id ?? "",
  );
  const [lines, setLines] = useState<LineEditorRow[]>(() =>
    mode === "edit" && initial
      ? linesFromJournalEntry(initial.lines)
      : initialJournalLines(),
  );

  const showCompany = (companies?.length ?? 0) > 1;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const entryDate = fd.get("entryDate") as string;
    const description = (fd.get("description") as string).trim();
    const reference = ((fd.get("reference") as string) || "").trim() || null;

    const payloadLines = lines.map((l) => ({
      accountId:   l.accountId,
      projectId:   null,
      description: l.description.trim() || null,
      debit:       l.debit.trim() || "0",
      credit:      l.credit.trim() || "0",
      currency:    l.currency.trim() || "ARS",
    }));

    startTransition(async () => {
      if (mode === "create") {
        const res = await createJournalEntryAction({
          companyId:   companyId || null,
          projectId:   null,
          entryDate,
          description,
          reference,
          lines:       payloadLines,
        });
        if ("error" in res) setError(res.error);
        else router.push(`/contabilidad/asientos/${res.id}`);
      } else if (entryId) {
        const res = await updateJournalEntryAction(entryId, {
          companyId:   companyId || null,
          projectId:   null,
          entryDate,
          description,
          reference,
          lines:       payloadLines,
        });
        if ("error" in res) setError(res.error);
        else router.push(`/contabilidad/asientos/${entryId}`);
      }
    });
  }

  const defaultDate = initial?.entryDate
    ? initial.entryDate.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {showCompany && (
          <div className="space-y-1 max-w-md">
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
          <div className="space-y-1">
            <Label htmlFor="entryDate">Fecha</Label>
            <Input id="entryDate" name="entryDate" type="date" required defaultValue={defaultDate} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reference">Referencia (opcional)</Label>
            <Input id="reference" name="reference" maxLength={256} defaultValue={initial?.reference ?? ""} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" required maxLength={1024} defaultValue={initial?.description ?? ""} />
          </div>
        </div>

        <JournalEntryLinesEditor accounts={accounts} lines={lines} onChange={setLines} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : mode === "create" ? "Crear borrador" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
