import { Badge } from "@/components/ui/badge";
import { contactRoleLabel } from "@/features/directory/types";

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  CLIENT: "default",
  SUPPLIER: "secondary",
  SUBCONTRACTOR: "outline",
  EMPLOYEE: "secondary",
  OTHER: "outline",
};

interface RoleBadgeProps {
  role: string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <Badge variant={ROLE_VARIANTS[role] ?? "outline"}>
      {contactRoleLabel(role)}
    </Badge>
  );
}
