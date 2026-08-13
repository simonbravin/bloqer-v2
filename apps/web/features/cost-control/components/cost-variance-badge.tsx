import { Badge } from "@/components/ui/badge";
import { formatMoneyAmount, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

type Props = { variance: string; label?: string };

export function CostVarianceBadge({ variance, label }: Props) {
  if (isZeroMoneyAmount(variance)) return <Badge variant="outline">{label ?? "—"}</Badge>;
  const formatted = formatMoneyAmount(variance);
  if (isPositiveMoneyAmount(variance)) {
    return (
      <Badge variant="secondary" className="text-green-700 dark:text-green-400">
        {label ?? `+${formatted}`}
      </Badge>
    );
  }
  return <Badge variant="destructive">{label ?? formatted}</Badge>;
}
