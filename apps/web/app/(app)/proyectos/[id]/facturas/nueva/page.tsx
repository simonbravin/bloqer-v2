import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { CertificationInvoiceForm } from "@/features/sales-invoices";
import type { CertSummary } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { canEditArArea, getCertificationById, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ certificationId?: string }>;
}

export default async function NuevaFacturaPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const { certificationId } = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  // Certification-based flow stays full-page (special wizard).
  if (certificationId) {
    let cert;
    try {
      cert = await getCertificationById(certificationId, ctx);
    } catch (err) {
      if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
      throw err;
    }

    if (cert.projectId !== projectId) notFound();
    if (cert.status !== "APPROVED") {
      return (
        <PageShell variant="default" className="space-y-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight">Generar factura</h1>
          </div>
          <p className="rounded border bg-card p-4 text-sm text-muted-foreground">
            Solo se pueden facturar certificaciones en estado <strong>Aprobada</strong>. Esta
            certificación está en estado &quot;{cert.status}&quot;.
          </p>
        </PageShell>
      );
    }

    const certSummary: CertSummary = {
      id: cert.id,
      code: cert.code,
      periodStart: formatDate(cert.periodStart),
      periodEnd: formatDate(cert.periodEnd),
      totalAmount: cert.totalAmount,
      currency: cert.currency,
    };

    return (
      <PageShell variant="default" className="space-y-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Generar factura desde certificación</h1>
        </div>
        <CertificationInvoiceForm projectId={projectId} cert={certSummary} />
      </PageShell>
    );
  }

  // Manual create → list dialog
  if (!canEditArArea(current.tenantCtx.roles)) {
    redirect(`/proyectos/${projectId}/facturas`);
  }
  redirect(`/proyectos/${projectId}/facturas?create=1`);
}
