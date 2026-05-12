"use client";
import { Badge } from "@/components/ui/badge";

const MAP = {
  ACTIVE:   { label: "Activo",   variant: "default" },
  INACTIVE: { label: "Inactivo", variant: "secondary" },
} as const;

export function ProductStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant as "default" | "secondary" | "outline"}>{cfg.label}</Badge>;
}
