import type { PlatformTenantOperationalFlags } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";

type Props = Pick<
  PlatformTenantOperationalFlags,
  "hasActiveOwner" | "hasActiveUsers" | "trialExpired" | "trialEndingWithinDays"
>;

export function PlatformTenantAlerts({
  hasActiveOwner,
  hasActiveUsers,
  trialExpired,
  trialEndingWithinDays,
}: Props) {
  const items: { key: string; label: string; variant: "destructive" | "secondary" | "outline" }[] = [];
  if (!hasActiveOwner) items.push({ key: "owner", label: "Sin OWNER", variant: "destructive" });
  if (!hasActiveUsers) items.push({ key: "users", label: "Sin usuarios", variant: "secondary" });
  if (trialExpired) items.push({ key: "expired", label: "Trial vencido", variant: "destructive" });
  else if (trialEndingWithinDays === 7)
    items.push({ key: "t7", label: "Trial ≤7d", variant: "outline" });
  else if (trialEndingWithinDays === 14)
    items.push({ key: "t14", label: "Trial ≤14d", variant: "outline" });

  if (items.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item.key} variant={item.variant} className="text-[10px] font-normal">
          {item.label}
        </Badge>
      ))}
    </div>
  );
}
