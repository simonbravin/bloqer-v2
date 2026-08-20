"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { roundMoney, serializeMoney, toIsoDateLocal } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FillableAmount } from "@/components/ui/fillable-amount";
import { cn } from "@/lib/utils";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatDate } from "@/lib/format";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SettlementFields } from "@/features/treasury/components/settlement-fields";
import type { SettlementMethodValue } from "@/features/treasury/lib/settlement-method-label";
import { createCollectionAction } from "@/app/(app)/proyectos/[id]/cobranzas/actions";
import { createCompanyCollectionAction } from "@/app/(app)/finanzas/cuentas-por-cobrar/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

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
  /** Field: confirmation step + return to the obligation. Desktop default unchanged. */
  fieldMode?: boolean;
  clientName?: string;
  successHref?: string;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function CollectionForm({
  projectId,
  companyFinanzas = false,
  receivableId,
  receivableBalance,
  receivableCurrency,
  accounts,
  fieldMode = false,
  clientName,
  successHref,
  variant = "card",
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SettlementMethodValue | "">("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();

  const matchingAccounts = accounts.filter((a) => a.currency === receivableCurrency);
  const balanceSerialized = serializeMoney(receivableBalance);
  const [amount, setAmount] = useState(balanceSerialized);
  const [collectionDate, setCollectionDate] = useState(() => (fieldMode ? toIsoDateLocal() : ""));
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

  function selectedAccountName(): string {
    return matchingAccounts.find((a) => a.id === accountId)?.name ?? "";
  }

  function goConfirm() {
    if (!accountId) {
      setError("Seleccioná una cuenta de tesorería");
      return;
    }
    if (!companyFinanzas && !projectId) {
      setError("Falta el proyecto");
      return;
    }
    const date = collectionDate.trim();
    if (!date) {
      setError("Ingresá la fecha de cobro");
      return;
    }
    try {
      roundMoney(amount);
    } catch {
      setError("Monto inválido");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accountId) { setError("Seleccioná una cuenta de tesorería"); return; }
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
    const rawRef = String(fd.get("reference") ?? "").trim();
    const payload = {
      receivableId,
      accountId,
      collectionDate: (fd.get("collectionDate") as string) || collectionDate,
      amount: collectFullBalance ? undefined : rounded,
      collectFullBalance: collectFullBalance || undefined,
      paymentMethod: paymentMethod || null,
      reference: rawRef || null,
      notes: (fd.get("notes") as string) || null,
      idempotencyKey,
    };
    startTransition(async () => {
      const res = companyFinanzas
        ? await createCompanyCollectionAction(payload)
        : await createCollectionAction(projectId!, payload);
      if ("error" in res) {
        setError(res.error);
        setStep("form");
      } else {
        rotateIdempotencyKey();
        onSuccess?.();
        const nextHref = successHref
          ?? (companyFinanzas
            ? `/finanzas/cuentas-por-cobrar/${receivableId}`
            : `/proyectos/${projectId}/cuentas-por-cobrar/${receivableId}`);
        router.push(nextHref);
        if (successHref) router.refresh();
      }
    });
  }

  if (matchingAccounts.length === 0) {
    return (
      <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
        <p className="text-sm text-muted-foreground">
          No hay cuentas de tesorería activas en {receivableCurrency}. Creá una cuenta con esa moneda primero.
        </p>
        {onCancel ? (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const confirmAmountLabel = (() => {
    try {
      return formatMoneyAmount(roundMoney(amount), receivableCurrency);
    } catch {
      return amount;
    }
  })();

  return (
    <div
      className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}
      data-testid={fieldMode ? "receivables-field-collection-form" : undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {fieldMode ? (
          <p className="text-sm font-medium" data-testid="receivables-field-pending-balance">
            Saldo pendiente: {formatMoneyAmount(receivableBalance, receivableCurrency)}
          </p>
        ) : null}

        <div className={step === "confirm" ? "hidden" : undefined}>
          <div className={fieldMode ? "space-y-4" : "grid grid-cols-2 gap-4"}>
            <div className={fieldMode ? "space-y-1" : "col-span-2 space-y-1"}>
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
              {fieldMode ? (
                <Input
                  id="collectionDate"
                  name="collectionDate"
                  type="date"
                  required
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                />
              ) : (
                <Input id="collectionDate" name="collectionDate" type="date" required />
              )}
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
              {fieldMode ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 min-h-11 w-full"
                  data-testid="receivables-field-collect-full"
                  onClick={() => fillAmount(receivableBalance)}
                >
                  Cobrar saldo total
                </Button>
              ) : null}
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

          <SettlementFields
            idPrefix="collection"
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
          />

          <div className="space-y-1">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
        </div>

        {fieldMode && step === "confirm" ? (
          <div
            className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm"
            data-testid="receivables-field-collection-confirm"
          >
            <p className="font-medium">Confirmá el cobro</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="font-medium">{clientName ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Monto</dt>
                <dd className="font-medium tabular-nums">{confirmAmountLabel}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cuenta</dt>
                <dd className="font-medium">{selectedAccountName()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Fecha</dt>
                <dd className="font-medium">{formatDate(collectionDate)}</dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={isPending}>
                Volver
              </Button>
              <Button type="submit" disabled={isPending} data-testid="receivables-field-confirm-collect">
                {isPending ? "Guardando…" : "Confirmar cobro"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel ?? (() => router.back())}>
              Cancelar
            </Button>
            {fieldMode ? (
              <Button
                type="button"
                disabled={isPending}
                data-testid="receivables-field-review-collect"
                onClick={goConfirm}
              >
                Registrar cobro
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Registrar cobro"}
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
