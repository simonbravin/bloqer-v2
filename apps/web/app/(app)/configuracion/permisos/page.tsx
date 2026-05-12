import type { PermissionAction, UserRole } from "@bloqer/domain";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { canReadTenantConfigArea, getPermissionMatrixOverview } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ceilingLabel(v: PermissionAction | null): string {
  if (v === null) return "—";
  if (v === "VIEW") return "Ver";
  if (v === "EDIT") return "Editar";
  return "Aprobar";
}

const ROLE_LABEL_ES: Record<UserRole, string> = {
  OWNER:            "Propietario",
  ADMIN:            "Administrador",
  FINANCE:          "Finanzas",
  PROCUREMENT:      "Compras",
  WAREHOUSE:        "Depósito",
  SALES:            "Ventas",
  VIEWER:           "Solo lectura",
  PROJECT_MANAGER:  "Jefe de obra",
  SITE_FOREMAN:     "Capataz",
  PROJECT_VIEWER:   "Visor de proyecto",
};

export default async function ConfiguracionPermisosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const matrix = await getPermissionMatrixOverview(ctx);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Permisos</h1>
        <p className="text-sm text-muted-foreground">
          Techo efectivo por rol y módulo según <code className="text-xs">can()</code> (VIEW ⊆ EDIT ⊆
          APROBAR). Incluye reglas especiales de la matriz. Solo referencia; el acceso real depende de la
          membresía del usuario.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-[140px] bg-background">Rol</TableHead>
              {matrix.modules.map((m) => (
                <TableHead key={m} className="min-w-[72px] whitespace-nowrap text-xs font-normal" title={m}>
                  {m}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.roles.map((role) => (
              <TableRow key={role}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium text-xs">
                  <span className="block">{ROLE_LABEL_ES[role] ?? role}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{role}</span>
                </TableCell>
                {matrix.modules.map((m) => (
                  <TableCell key={m} className="text-center text-xs">
                    {ceilingLabel(matrix.grid[role][m])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
