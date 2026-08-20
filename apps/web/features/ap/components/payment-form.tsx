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
import { SettlementFields } from "@/features/treasury/components/settlement-fields";
import type { SettlementMethodValue } from "@/features/treasury/lib/settlement-method-label";
import { createPaymentAction } from "@/app/(app)/proyectos/[id]/cuentas-por-pagar/actions";
import { createCompanyPaymentAction } from "@/app/(app)/finanzas/cuentas-por-pagar/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SettlementMethodValue | "">("");
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();

  const matchingAccounts = accounts.filter((a) => a.currency === payableCurrency);
  const balanceSerialized = serializeMoney(payableBalance);
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
    if (!accountId) { setError("Seleccioná una cuenta de tesorería"); return; }
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
    const payFullBalance =
      rounded === balanceSerialized || rawAmount === payableBalance || rawAmount === balanceSerialized;
    const rawRef = String(fd.get("reference") ?? "").trim();
    const payload = {
      payableId,
      accountId,
      paymentDate: fd.get("paymentDate") as string,
      amount: payFullBalance ? undefined : rounded,
      payFullBalance: payFullBalance || undefined,
      paymentMethod: paymentMethod || null,
      reference: rawRef || null,
      notes: (fd.get("notes") as string) || null,
      idempotencyKey,
    };
    startTransition(async () => {
      if (companyFinanzas) {
        const res = await createCompanyPaymentAction(payload);
        if ("error" in res) {
          setError(res.error);
        } else {
          rotateIdempotencyKey();
          onSuccess?.();
          router.push(`/finanzas/pagos-proveedor/${res.id}`);
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
      } else {
        rotateIdempotencyKey();
        onSuccess?.();
        router.push(`/proyectos/${projectId}/pagos/${res.id}`);
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

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
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
            <Input id="paymentDate" name="paymentDate" type="date" required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">Monto ({payableCurrency})</Label>
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
                  amount: payableBalance,
                  currency: payableCurrency,
                },
              ]}
            />
          </div>
        </div>

        <SettlementFields
          idPrefix="payment"
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
        />

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel ?? (() => router.back())}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Registrar pago"}
          </Button>
        </div>
      </form>
    </div>
  );
}
