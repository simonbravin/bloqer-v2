import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { AccountingEventTypeBadge, DeactivateMappingRuleButton } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getAccountingMappingRuleById } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

export default async function ReglaContableDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ ruleId: string }>;
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const { ruleId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let rule;
  try {
    rule = await getAccountingMappingRuleById(ruleId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const q = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";
  const canEdit = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  return (
    <PageShell variant="detail" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PageBackLink href={`/contabilidad/reglas${q}`} label="Volver" />
          <h1 className="text-2xl font-bold tracking-tight">{rule.name}</h1>
          <AccountingEventTypeBadge eventType={rule.eventType} />
        </div>
        {canEdit && (
          <Button variant="outline" asChild>
            <Link href={`/contabilidad/reglas/${ruleId}/editar${q}`}>Editar</Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Estado:</span>{" "}
          {rule.isActive ? "Activa" : "Inactiva"}
        </p>
        <p>
          <span className="text-muted-foreground">Prioridad:</span> {rule.priority}
        </p>
        {rule.description && (
          <p>
            <span className="text-muted-foreground">Descripción:</span> {rule.description}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Debe:</span>{" "}
          <span className="font-mono">{rule.debitAccountCode}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Haber:</span>{" "}
          <span className="font-mono">{rule.creditAccountCode}</span>
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Sugerencias de asiento</p>
        <p>
          Las reglas activas se usan al generar borradores desde cobranzas, pagos, tesorería o
          consumos de inventario (fase 11C). Nada se contabiliza ni se postea en automático: siempre
          revisá el asiento en Contabilidad.
        </p>
      </div>

      {canEdit && rule.isActive && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold mb-3">Acciones</h2>
          <DeactivateMappingRuleButton ruleId={rule.id} ruleCompanyId={rule.companyId} />
        </div>
      )}
    </PageShell>
  );
}
