import { formatDate, formatDateTime } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { CertificationInvoiceForm, ManualInvoiceForm } from "@/features/sales-invoices";
import type { CertSummary, ClientOption } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { getCertificationById, listContacts, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

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

  // ── Certification-based flow ──────────────────────────────────────────────
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
        <PageShell variant="form" className="space-y-4">
          <div className="flex items-center gap-4">
            <PageBackLink
              href={`/proyectos/${projectId}/certificaciones/${certificationId}`}
              label="Volver"
            />
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
      <PageShell variant="form" className="space-y-6">
        <div className="flex items-center gap-4">
          <PageBackLink
            href={`/proyectos/${projectId}/certificaciones/${certificationId}`}
            label="Volver"
          />
          <h1 className="text-2xl font-bold tracking-tight">Generar factura desde certificación</h1>
        </div>
        <CertificationInvoiceForm projectId={projectId} cert={certSummary} />
      </PageShell>
    );
  }

  // ── Manual flow ───────────────────────────────────────────────────────────
  const { data: contacts } = await listContacts({ role: "CLIENT", status: "ACTIVE" }, ctx);

  const clients: ClientOption[] = contacts.map((c) => ({
    id: c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${projectId}/facturas`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura</h1>
      </div>
      <ManualInvoiceForm projectId={projectId} clients={clients} />
    </PageShell>
  );
}
