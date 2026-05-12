"use client";
import { Badge } from "@/components/ui/badge";

const MAP = {
  IN:           { label: "Entrada",         variant: "default" },
  OUT:          { label: "Salida",          variant: "secondary" },
  TRANSFER_IN:  { label: "Traslado entrada", variant: "outline" },
  TRANSFER_OUT: { label: "Traslado salida",  variant: "outline" },
  ADJUSTMENT:   { label: "Ajuste",          variant: "secondary" },
} as const;

export function StockMovementTypeBadge({ type }: { type: string }) {
  const cfg = MAP[type as keyof typeof MAP] ?? { label: type, variant: "outline" };
  return <Badge variant={cfg.variant as "default" | "secondary" | "outline"}>{cfg.label}</Badge>;
}
