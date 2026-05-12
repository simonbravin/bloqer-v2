import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";

export default async function FinanzasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const roles = current.tenantCtx.roles;

  const allSections = [
    {
      href:        "/finanzas/cuentas-por-cobrar-aging",
      title:       "Aging — Cuentas por cobrar",
      description: "Saldos pendientes de cobro agrupados por cliente y vencimiento.",
      canAccess:   can(roles, "VIEW", "AR"),
    },
    {
      href:        "/finanzas/cuentas-por-pagar-aging",
      title:       "Aging — Cuentas por pagar",
      description: "Saldos pendientes de pago agrupados por proveedor y vencimiento.",
      canAccess:   can(roles, "VIEW", "AP"),
    },
  ];

  const sections = allSections.filter((s) => s.canAccess);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenés permisos para ver reportes de finanzas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-lg border bg-card p-5 hover:bg-muted/40 transition-colors"
            >
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
