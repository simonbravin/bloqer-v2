import { Badge } from "@/components/ui/badge";

type Props = { variance: string; label?: string };

export function CostVarianceBadge({ variance, label }: Props) {
  const v = parseFloat(variance);
  if (isNaN(v) || v === 0) return <Badge variant="outline">{label ?? "—"}</Badge>;
  if (v > 0) return <Badge variant="secondary" className="text-green-700 dark:text-green-400">{label ?? `+${v.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}</Badge>;
  return <Badge variant="destructive">{label ?? v.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</Badge>;
}
