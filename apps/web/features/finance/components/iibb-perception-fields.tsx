"use client";

import {
  IIBB_PERCEPTION_HINT_ES,
  IIBB_PERCEPTION_LABEL_ES,
} from "@bloqer/domain";
import { addDecimal, calcIibbPerceptionAmount, roundMoney } from "@bloqer/utils";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { formatDecimalArFromString, formatRatePctFromString } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export type IibbPerceptionFieldsProps = {
  rate: string;
  onRateChange: (v: string) => void;
  /** Net subtotal (before IVA) used for the amount preview. */
  subtotal: string;
  disabled?: boolean;
  /** Tighter layout for totals footers. */
  compact?: boolean;
  className?: string;
  id?: string;
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

/** Editable alícuota + read-only perception amount ([D-112]). */
export function IibbPerceptionFields({
  rate,
  onRateChange,
  subtotal,
  disabled = false,
  compact = false,
  className,
  id = "iibb-perception-rate",
}: IibbPerceptionFieldsProps) {
  const amount = previewIibbPerceptionAmount(subtotal, rate);

  return (
    <div className={cn(compact ? "space-y-1 text-right" : "space-y-2", className)}>
      <div
        className={cn(
          compact
            ? "flex flex-col items-end gap-1"
            : "flex flex-wrap items-end gap-3",
        )}
      >
        <div className={cn("space-y-1", compact ? "w-full max-w-[7.5rem]" : "w-28")}>
          <Label htmlFor={id} className="text-xs text-muted-foreground">
            Alícuota IIBB %
          </Label>
          <DecimalInput
            id={id}
            value={rate}
            onValueChange={onRateChange}
            disabled={disabled}
            placeholder="3"
            className={cn("text-sm", compact ? "h-8 text-right" : "h-9")}
          />
        </div>
        <div className={cn("space-y-1", compact ? "w-full" : "min-w-[7rem]")}>
          <p className="text-xs text-muted-foreground">{IIBB_PERCEPTION_LABEL_ES}</p>
          <p
            className={cn(
              "tabular-nums font-medium",
              compact ? "text-sm" : "flex h-9 items-center text-sm",
            )}
          >
            {formatDecimalArFromString(amount)}
          </p>
        </div>
      </div>
      <p className={cn("text-xs text-muted-foreground", compact && "max-w-[16rem] text-right")}>
        {IIBB_PERCEPTION_HINT_ES}
      </p>
    </div>
  );
}

export type DocumentTaxTotalsFooterProps = {
  subtotal: string;
  taxAmount: string;
  /** When set with `onIibbPerceptionRateChange`, shows IIBB controls and includes perception in Total. */
  iibbPerceptionRate?: string;
  onIibbPerceptionRateChange?: (v: string) => void;
  disabled?: boolean;
  totalLabel?: string;
  className?: string;
};

/** Subtotal | IVA | Perc. IIBB (optional) | Total — matches invoice/PO footer spacing. */
export function DocumentTaxTotalsFooter({
  subtotal,
  taxAmount,
  iibbPerceptionRate,
  onIibbPerceptionRateChange,
  disabled = false,
  totalLabel = "Total (vista previa)",
  className,
}: DocumentTaxTotalsFooterProps) {
  const showIibb =
    iibbPerceptionRate != null && typeof onIibbPerceptionRateChange === "function";
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
        "flex flex-wrap justify-end gap-x-8 gap-y-2 border-t pt-3 text-sm",
        className,
      )}
    >
      <div className="text-right">
        <p className="text-xs text-muted-foreground">Subtotal</p>
        <p className="tabular-nums font-medium">{formatDecimalArFromString(subtotal)}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">IVA</p>
        <p className="tabular-nums font-medium">{formatDecimalArFromString(taxAmount)}</p>
      </div>
      {showIibb ? (
        <IibbPerceptionFields
          rate={iibbPerceptionRate}
          onRateChange={onIibbPerceptionRateChange}
          subtotal={subtotal}
          disabled={disabled}
          compact
        />
      ) : null}
      <div className="text-right">
        <p className="text-xs text-muted-foreground font-semibold">{totalLabel}</p>
        <p className="tabular-nums font-semibold">{formatDecimalArFromString(total)}</p>
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
