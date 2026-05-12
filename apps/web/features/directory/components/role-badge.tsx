import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Cliente",
  SUPPLIER: "Proveedor",
  SUBCONTRACTOR: "Subcontratista",
  EMPLOYEE: "Empleado",
  OTHER: "Otro",
};

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
      {ROLE_LABELS[role] ?? role}
    </Badge>
  );
}
