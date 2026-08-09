import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { CertificationListSection, NewCertificationDialog } from "@/features/certifications";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  listBudgetsByProject,
  listCertificationsByProject,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { createCertificationAction } from "./actions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ create?: string }>;
}

export default async function CertificacionesPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const [certs, allBudgets] = await Promise.all([
    listCertificationsByProject(id, ctx),
    listBudgetsByProject(id, ctx),
  ]);

  const eligibleBudgets = allBudgets
    .filter((b) => b.status === "APPROVED" || b.status === "CLOSED")
    .map((b) => ({
      id: b.id,
      name: b.name,
      versionNumber: b.versionNumber,
      status: b.status,
    }));

  const serialized = certs.map((c) => ({
    id: c.id,
    projectId: id,
    code: c.code,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    status: c.status,
    totalAmount: c.totalAmount,
    currency: c.currency,
  }));

  const canEditCert = can(current.tenantCtx.roles, "EDIT", "CERTIFICATIONS");

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Certificaciones"
        subtitle={`${serialized.length} ${serialized.length === 1 ? "certificación" : "certificaciones"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`certificaciones-${id}`} />
            </Suspense>
            {canEditCert ? (
              <Suspense fallback={null}>
                <NewCertificationDialog
                  projectId={id}
                  budgets={eligibleBudgets}
                  defaultBudgetId={
                    eligibleBudgets.length === 1 ? eligibleBudgets[0]!.id : undefined
                  }
                  onSubmit={createCertificationAction.bind(null, id)}
                  defaultOpen={sp.create === "1"}
                />
              </Suspense>
            ) : null}
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <CertificationListSection certifications={serialized} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
