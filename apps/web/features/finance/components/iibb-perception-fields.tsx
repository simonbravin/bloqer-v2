"use client";

import { IIBB_PERCEPTION_LABEL_ES } from "@bloqer/domain";
import { addDecimal, calcIibbPerceptionAmount, roundMoney } from "@bloqer/utils";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { formatDecimalArFromString, formatRatePctFromString } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export type IibbPerceptionFieldsProps = {
  rate: string;
  onRateChange: (v: string) => void;
  /** Net subtotal (before IVA) — when set, shows Perc. IIBB amount under the rate. */
  subtotal?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Match TaxRateSelect / quote “Alícuota IVA”. */
  label?: string;
};

export function previewIibbPerceptionAmount(subtotal: string, rate: string): string {
  try {
    return calcIibbPerceptionAmount({
      subtotal: subtotal.trim() || "0",
      ratePercent: rate.trim() || "0",
    });
  } catch {
    return "0.00";
  }
}

/** Document-level alícuota — same shape as “Alícuota IVA” ([D-112]). */
export function IibbPerceptionFields({
  rate,
  onRateChange,
  subtotal,
  disabled = false,
  className,
  id = "iibb-perception-rate",
  label = "Alícuota IIBB (%)",
}: IibbPerceptionFieldsProps) {
  const amount =
    subtotal != null ? previewIibbPerceptionAmount(subtotal, rate) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <DecimalInput
        id={id}
        value={rate}
        onValueChange={(v) => onRateChange(v.trim() === "" ? "0" : v)}
        disabled={disabled}
        placeholder="3"
        className="h-9 text-sm"
      />
      {amount != null ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {IIBB_PERCEPTION_LABEL_ES}: {formatDecimalArFromString(amount)}
        </p>
      ) : null}
    </div>
  );
}

export type DocumentTaxTotalsFooterProps = {
  subtotal: string;
  taxAmount: string;
  /** When set, Perc. IIBB amount is shown and included in Total. */
  iibbPerceptionRate?: string;
  onIibbPerceptionRateChange?: (v: string) => void;
  /** When false, only shows Perc. IIBB amount (rate edited elsewhere, e.g. next to Alícuota IVA). */
  showIibbRateInput?: boolean;
  disabled?: boolean;
  totalLabel?: string;
  className?: string;
};

/**
 * Subtotal | IVA | [Alícuota IIBB %] | Perc. IIBB | Total —
 * same column rhythm as the previous Subtotal/IVA/Total footer.
 */
export function DocumentTaxTotalsFooter({
  subtotal,
  taxAmount,
  iibbPerceptionRate,
  onIibbPerceptionRateChange,
  showIibbRateInput = true,
  disabled = false,
  totalLabel = "Total (vista previa)",
  className,
}: DocumentTaxTotalsFooterProps) {
  const showIibb = iibbPerceptionRate != null;
  const canEditRate =
    showIibb &&
    showIibbRateInput &&
    typeof onIibbPerceptionRateChange === "function";
  const iibbAmount = showIibb
    ? previewIibbPerceptionAmount(subtotal, iibbPerceptionRate)
    : "0.00";
  let total = "0.00";
  try {
    total = showIibb
      ? roundMoney(addDecimal(addDecimal(subtotal, taxAmount), iibbAmount))
      : roundMoney(addDecimal(subtotal, taxAmount));
  } catch {
    total = "0.00";
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-end gap-x-8 gap-y-2 border-t pt-3 text-sm",
        className,
      )}
    >
      <div className="text-right">
        <p className="text-xs text-muted-foreground">Subtotal</p>
        <p className="flex h-9 items-center justify-end tabular-nums font-medium">
          {formatDecimalArFromString(subtotal)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">IVA</p>
        <p className="flex h-9 items-center justify-end tabular-nums font-medium">
          {formatDecimalArFromString(taxAmount)}
        </p>
      </div>
      {canEditRate ? (
        <div className="space-y-1 text-right">
          <Label
            htmlFor="document-iibb-rate"
            className="text-xs text-muted-foreground"
          >
            Alícuota IIBB %
          </Label>
          <DecimalInput
            id="document-iibb-rate"
            value={iibbPerceptionRate}
            onValueChange={(v) =>
              onIibbPerceptionRateChange(v.trim() === "" ? "0" : v)
            }
            disabled={disabled}
            placeholder="3"
            className="h-9 w-[5.5rem] text-right text-sm"
          />
        </div>
      ) : null}
      {showIibb ? (
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{IIBB_PERCEPTION_LABEL_ES}</p>
          <p className="flex h-9 items-center justify-end tabular-nums font-medium">
            {formatDecimalArFromString(iibbAmount)}
          </p>
        </div>
      ) : null}
      <div className="text-right">
        <p className="text-xs text-muted-foreground font-semibold">{totalLabel}</p>
        <p className="flex h-9 items-center justify-end tabular-nums font-semibold">
          {formatDecimalArFromString(total)}
        </p>
      </div>
    </div>
  );
}

/** Read-only IIBB row for detail pages (between IVA and Total). */
export function IibbPerceptionDetailRow({
  rate,
  amount,
  currency,
  formatAmount,
}: {
  rate: string;
  amount: string;
  currency?: string;
  formatAmount: (amount: string, currency?: string) => string;
}) {
  const rateLabel = (() => {
    try {
      return formatRatePctFromString(rate);
    } catch {
      return rate;
    }
  })();

  return (
    <div className="text-right">
      <p className="text-muted-foreground">
        {IIBB_PERCEPTION_LABEL_ES}
        {rateLabel ? ` (${rateLabel}%)` : ""}
      </p>
      <p className="tabular-nums">{formatAmount(amount, currency)}</p>
    </div>
  );
}
