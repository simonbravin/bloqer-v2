"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { AccountTypeBadge } from "./account-type-badge";

export interface CompanyOption {
  id:   string;
  name: string;
}

export type ExistingAccountOption = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  companyId: string;
  isActive: boolean;
};

interface Props {
  companies?: CompanyOption[];
  defaultCompanyId?: string | null;
  existingAccounts?: ExistingAccountOption[];
}

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Patrimonio",
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
};

function accountHref(accountId: string, companyId: string): string {
  return `/contabilidad/cuentas/${accountId}?empresa=${encodeURIComponent(companyId)}`;
}

function rankMatch(text: string, q: string): number {
  if (text === q) return 0;
  if (text.startsWith(q)) return 1;
  return 2;
}

export function AccountingAccountForm({
  companies,
  defaultCompanyId,
  existingAccounts = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<AccountType | "">("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const [companyId, setCompanyId] = useState<string>(
    defaultCompanyId ?? companies?.[0]?.id ?? "",
  );
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const companyAccounts = useMemo(() => {
    if (!companyId) return [];
    return existingAccounts.filter((a) => a.companyId === companyId);
  }, [existingAccounts, companyId]);

  const nameMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return companyAccounts
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const byName =
          rankMatch(a.name.toLowerCase(), q) - rankMatch(b.name.toLowerCase(), q);
        if (byName !== 0) return byName;
        return a.code.localeCompare(b.code, "es");
      })
      .slice(0, 8);
  }, [companyAccounts, name]);

  const exactNameMatch = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    return companyAccounts.find((a) => a.name.toLowerCase() === q) ?? null;
  }, [companyAccounts, name]);

  const exactCodeMatch = useMemo(() => {
    const q = code.trim().toLowerCase();
    if (!q) return null;
    return companyAccounts.find((a) => a.code.toLowerCase() === q) ?? null;
  }, [companyAccounts, code]);

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
        code:        code.trim(),
        name:        name.trim(),
        type:        type as AccountType,
        parentId:    null,
        description: (fd.get("description") as string)?.trim() || null,
      });
      if ("error" in res) setError(res.error);
      else {
        const qs = companyId ? `?empresa=${encodeURIComponent(companyId)}` : "";
        router.push(`/contabilidad/cuentas${qs}`);
      }
    });
  }

  const showCompany = (companies?.length ?? 0) > 1;
  const showSuggestions = nameFocused && nameMatches.length > 0;

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
            <Input
              id="code"
              name="code"
              required
              maxLength={64}
              className="font-mono"
              placeholder="Ej. 1.1.01"
              value={code}
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
            />
            {exactCodeMatch ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ya existe el código {exactCodeMatch.code} (
                <Link
                  href={accountHref(exactCodeMatch.id, exactCodeMatch.companyId)}
                  className="underline underline-offset-2"
                >
                  {exactCodeMatch.name}
                </Link>
                ). El alta va a fallar si lo reutilizás.
              </p>
            ) : null}
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative space-y-1 sm:col-span-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={256}
              value={name}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls="account-name-suggestions"
              onChange={(e) => setName(e.target.value)}
              onFocus={() => {
                if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                setNameFocused(true);
              }}
              onBlur={() => {
                if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                blurTimerRef.current = setTimeout(() => setNameFocused(false), 150);
              }}
              placeholder="Ej. Caja"
            />
            {showSuggestions ? (
              <ul
                id="account-name-suggestions"
                role="listbox"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
              >
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  Cuentas ya registradas que coinciden
                </li>
                {nameMatches.map((a) => (
                  <li key={a.id} role="option">
                    <Link
                      href={accountHref(a.id, a.companyId)}
                      className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs text-muted-foreground">{a.code}</span>{" "}
                        <span className="font-medium">{a.name}</span>
                        {!a.isActive ? (
                          <span className="ml-1 text-xs text-muted-foreground">(inactiva)</span>
                        ) : null}
                      </span>
                      <AccountTypeBadge type={a.type} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {exactNameMatch ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ya existe una cuenta con este nombre (
                <Link
                  href={accountHref(exactNameMatch.id, exactNameMatch.companyId)}
                  className="underline underline-offset-2"
                >
                  {exactNameMatch.code}
                </Link>
                {!exactNameMatch.isActive ? ", inactiva" : ""}
                ). Revisá si conviene reutilizarla.
              </p>
            ) : name.trim().length >= 2 && nameMatches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay cuentas similares con ese texto.
              </p>
            ) : null}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea id="description" name="description" rows={2} maxLength={1024} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending || !!exactCodeMatch}>
            {isPending ? "Guardando…" : "Crear cuenta"}
          </Button>
        </div>
      </form>
    </div>
  );
}
