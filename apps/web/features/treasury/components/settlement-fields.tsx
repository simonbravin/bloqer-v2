"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SETTLEMENT_METHOD_OPTIONS,
  type SettlementMethodValue,
} from "../lib/settlement-method-label";

const NONE = "__none__";

interface Props {
  /** Controlled method value; empty string = unset */
  paymentMethod: SettlementMethodValue | "";
  onPaymentMethodChange: (value: SettlementMethodValue | "") => void;
  /** Optional id prefix to avoid collisions when multiple forms mount */
  idPrefix?: string;
}

/** Optional método + referencia for Collection / Payment forms ([D-074]). */
export function SettlementFields({
  paymentMethod,
  onPaymentMethodChange,
  idPrefix = "settlement",
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-method`}>Método (opcional)</Label>
        <Select
          value={paymentMethod || NONE}
          onValueChange={(v) =>
            onPaymentMethodChange(v === NONE ? "" : (v as SettlementMethodValue))
          }
        >
          <SelectTrigger id={`${idPrefix}-method`}>
            <SelectValue placeholder="Sin especificar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin especificar</SelectItem>
            {SETTLEMENT_METHOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-reference`}>Referencia (opcional)</Label>
        <Input
          id={`${idPrefix}-reference`}
          name="reference"
          maxLength={120}
          placeholder="N° transferencia, cheque…"
        />
      </div>
    </div>
  );
}
