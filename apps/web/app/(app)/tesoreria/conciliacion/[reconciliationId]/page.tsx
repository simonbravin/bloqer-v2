import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@bloqer/domain";
import {
  getBankReconciliationById,
  listCandidateMovementsForReconciliation,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { bankReconciliationStatusLabel } from "@/features/treasury/lib/bank-reconciliation-status-label";
import { canEditBankReconciliationUi } from "@/features/treasury/lib/treasury-edit-gates";
import { BankReconciliationWorkspace } from "@/features/treasury/components/bank-reconciliation-workspace";

interface PageProps {
  params: Promise<{ reconciliationId: string }>;
}

export default async function ConciliacionDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { reconciliationId } = await params;
  if (!z.string().uuid().safeParse(reconciliationId).success) notFound();

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!can(ctx.roles, "VIEW", "BANK_RECONCILIATION")) {
    return (
      <PageShell variant="default" className="space-y-6">
        <ListEmptyState
          title="Sin permisos para ver conciliación"
          description="Pedile a un administrador que te asigne el permiso de ver conciliación bancaria."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/tesoreria">Volver a tesorería</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  let session;
  let candidates;
  try {
    session = await getBankReconciliationById(reconciliationId, ctx);
    candidates = await listCandidateMovementsForReconciliation(reconciliationId, ctx);
  } catch (err) {
    // Resource lookup: never distinguish cross-tenant FORBIDDEN from missing (enumeration).
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  const canEdit = canEditBankReconciliationUi(ctx.roles);

  return (
    <PageShell
      variant="default"
      className="space-y-6"
      breadcrumbLabel={`${session.accountName} · ${formatDate(session.periodEnd)}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Conciliación</h1>
        <Badge variant={session.status === "CLOSED" ? "default" : "secondary"}>
          {bankReconciliationStatusLabel(session.status)}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {session.accountName} · {formatDate(session.periodStart)} — {formatDate(session.periodEnd)} ·{" "}
        {session.currency}
      </p>

      <BankReconciliationWorkspace
        session={session}
        candidates={candidates}
        canEdit={canEdit}
      />
    </PageShell>
  );
}
