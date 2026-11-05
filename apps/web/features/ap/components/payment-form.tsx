"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compareDecimal, roundMoney, serializeMoney, toIsoDateLocal } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
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
import { createPaymentAction } from "@/app/(app)/proyectos/[id]/cuentas-por-pagar/actions";
import { createCompanyPaymentAction } from "@/app/(app)/finanzas/cuentas-por-pagar/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  payableId: string;
  payableBalance: string;
  payableCurrency: string;
  accounts: AccountOption[];
  /** Project workspace */
  projectId?: string;
  companyFinanzas?: boolean;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  /** Field: confirmation step + return to the obligation. Desktop default unchanged. */
  fieldMode?: boolean;
  supplierName?: string;
  successHref?: string;
}

export function PaymentForm({
  projectId,
  companyFinanzas = false,
  payableId,
  payableBalance,
  payableCurrency,
  accounts,
  variant = "card",
  onCancel,
  onSuccess,
  onPendingChange,
  fieldMode = false,
  supplierName,
  successHref,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending: isPending, run, isBusy } = useOperationalAction({ onError: (message) => { setError(message); setStep("form"); }, onPendingChange });
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SettlementMethodValue | "">("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();

  const matchingAccounts = accounts.filter((a) => a.currency === payableCurrency);
  const balanceSerialized = serializeMoney(payableBalance);
  const [amount, setAmount] = useState(balanceSerialized);
  const [fxRate, setFxRate] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => (fieldMode ? toIsoDateLocal() : ""));
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
    if (isBusy()) return;
    if (!accountId) {
      setError("Seleccioná una cuenta de tesorería");
      return;
    }
    const date = paymentDate.trim();
    if (!date) {
      setError("Ingresá la fecha de pago");
      return;
    }
    try {
      if (payableCurrency !== "ARS" && (!fxRate || compareDecimal(fxRate, "0") <= 0)) {
        setError("Ingresá un tipo de cambio mayor a 0.");
        return;
      }
      const rounded = roundMoney(amount);
      if (compareDecimal(rounded, "0") <= 0) {
        setError("Ingresá un monto mayor a cero");
        return;
      }
      if (compareDecimal(rounded, balanceSerialized) > 0) {
        setError("El monto supera el saldo pendiente");
        return;
      }
    } catch {
      setError("Monto inválido");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy()) return;
    setError(null);
    if (!accountId) { setError("Seleccioná una cuenta de tesorería"); return; }
    const fd = new FormData(e.currentTarget);
    const rawAmount = String(fd.get("amount") ?? "").trim() || amount.trim();
    let rounded: string;
    try {
      rounded = roundMoney(rawAmount);
    } catch {
      setError("Monto inválido");
      return;
    }
    if (compareDecimal(rounded, balanceSerialized) > 0) {
      setError("El monto supera el saldo pendiente");
      return;
    }
    // D-053: full balance uses stored balanceDue server-side (avoid round-then-reapply).
    const payFullBalance =
      rounded === balanceSerialized || rawAmount === payableBalance || rawAmount === balanceSerialized;
    const rawRef = String(fd.get("reference") ?? "").trim();
    const payload = {
      payableId,
      fxRate: payableCurrency === "ARS" ? undefined : fxRate,
      accountId,
      paymentDate: (fd.get("paymentDate") as string) || paymentDate,
      amount: payFullBalance ? undefined : rounded,
      payFullBalance: payFullBalance || undefined,
      paymentMethod: paymentMethod || null,
      reference: rawRef || null,
      notes: (fd.get("notes") as string) || null,
      idempotencyKey,
    };
    void run(async () => {
      if (companyFinanzas) {
        const res = await createCompanyPaymentAction(payload);
        if ("error" in res) {
          setError(res.error);
          setStep("form");
        } else {
          rotateIdempotencyKey();
          onSuccess?.();
          if (successHref) {
            router.push(successHref);
            router.refresh();
          } else {
            router.push(`/finanzas/pagos-proveedor/${res.id}`);
          }
        }
        return;
      }
      if (!projectId) {
        setError("Configuración inválida del formulario");
        return;
      }
      const res = await createPaymentAction(projectId, payload);
      if ("error" in res) {
        setError(res.error);
        setStep("form");
      } else {
        rotateIdempotencyKey();
        onSuccess?.();
        if (successHref) {
          router.push(successHref);
          router.refresh();
        } else {
          router.push(`/proyectos/${projectId}/pagos/${res.id}`);
        }
      }
    });
  }

  if (matchingAccounts.length === 0) {
    return (
      <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
        <p className="text-sm text-muted-foreground">
          No hay cuentas de tesorería activas en {payableCurrency}. Creá una cuenta con esa moneda primero.
        </p>
        {onCancel ? (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cerrar
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const confirmAmountLabel = (() => {
    try {
      return formatMoneyAmount(roundMoney(amount), payableCurrency);
    } catch {
      return amount;
    }
  })();

  return (
    <div
      className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}
      data-testid={fieldMode ? "payables-field-payment-form" : undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={isPending} aria-busy={isPending} className="min-w-0 space-y-4">
        {error && (
          <p role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {fieldMode ? (
          <p className="text-sm font-medium" data-testid="payables-field-pending-balance">
            Saldo pendiente: {formatMoneyAmount(payableBalance, payableCurrency)}
          </p>
        ) : null}

        <div className={step === "confirm" ? "hidden" : undefined}>
          <div className={fieldMode ? "space-y-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
            <div className={fieldMode ? "space-y-1" : "sm:col-span-2 space-y-1"}>
              <Label htmlFor="payment-account">Cuenta de tesorería ({payableCurrency})</Label>
              <Select onValueChange={setAccountId} value={accountId}>
                <SelectTrigger id="payment-account">
                  <SelectValue placeholder="Seleccionar cuenta…" />
                </SelectTrigger>
                <SelectContent>
                  {matchingAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="paymentDate">Fecha de pago</Label>
              {fieldMode ? (
                <Input
                  id="paymentDate"
                  name="paymentDate"
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              ) : (
                <Input id="paymentDate" name="paymentDate" type="date" required />
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount">Monto ({payableCurrency})</Label>
              <DecimalInput
                id="amount"
                name="amount"
                required
                value={amount}
                onValueChange={setAmount}
                placeholder="0,00"
                className={cn(flash && "ring-2 ring-primary transition-shadow")}
              />
              {fieldMode ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 min-h-11 w-full"
                  data-testid="payables-field-pay-full"
                  onClick={() => fillAmount(payableBalance)}
                >
                  Pagar saldo total
                </Button>
              ) : null}
              <FillableAmount
                className="pt-1"
                onPick={(v) => fillAmount(v)}
                toastOnPick={() => "Monto completado con el saldo pendiente."}
                suggestions={[
                  {
                    label: "Saldo pendiente",
                    amount: payableBalance,
                    currency: payableCurrency,
                  },
                ]}
              />
            </div>
          </div>

          <ManualFxField currency={payableCurrency} value={fxRate} onValueChange={setFxRate} disabled={isPending} />
          <SettlementFields
            idPrefix="payment"
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
            data-testid="payables-field-payment-confirm"
          >
            <p className="font-medium">Confirmá el pago</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Proveedor</dt>
                <dd className="font-medium">{supplierName ?? "—"}</dd>
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
                <dd className="font-medium">{formatDate(paymentDate)}</dd>
              </div>
              {payableCurrency !== "ARS" ? <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Tipo de cambio</dt><dd>{fxRate} ARS por 1 {payableCurrency}</dd></div> : null}
            </dl>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={isPending}>
                Volver
              </Button>
              <Button type="submit" disabled={isPending} data-testid="payables-field-confirm-pay">
                {isPending ? "Guardando…" : "Confirmar pago"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => { if (!isBusy()) (onCancel ?? (() => router.back()))(); }}>
              Cancelar
            </Button>
            {fieldMode ? (
              <Button
                type="button"
                disabled={isPending}
                data-testid="payables-field-review-pay"
                onClick={goConfirm}
              >
                Registrar pago
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Registrar pago"}
              </Button>
            )}
          </div>
        )}
        </fieldset>
      </form>
    </div>
  );
}
