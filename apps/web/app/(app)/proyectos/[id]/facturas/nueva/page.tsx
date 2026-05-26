import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CertificationInvoiceForm, ManualInvoiceForm,
} from "@/features/sales-invoices";
import type { CertSummary, ClientOption } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { getCertificationById, listContacts, ServiceError } from "@bloqer/services";

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
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/proyectos/${projectId}/certificaciones/${certificationId}`}>← Volver</Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Generar factura</h1>
          </div>
          <p className="rounded border bg-card p-4 text-sm text-muted-foreground">
            Solo se pueden facturar certificaciones en estado <strong>Aprobada</strong>. Esta certificación está en estado &quot;{cert.status}&quot;.
          </p>
        </div>
      );
    }

    const certSummary: CertSummary = {
      id: cert.id,
      code: cert.code,
      periodStart: formatDate(cert.periodStart),
      periodEnd:   formatDate(cert.periodEnd),
      totalAmount: cert.totalAmount,
      currency:    cert.currency,
    };

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/certificaciones/${certificationId}`}>← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Generar factura desde certificación</h1>
        </div>
        <CertificationInvoiceForm projectId={projectId} cert={certSummary} />
      </div>
    );
  }

  // ── Manual flow ───────────────────────────────────────────────────────────
  const { data: contacts } = await listContacts(
    { role: "CLIENT", status: "ACTIVE" },
    ctx,
  );

  const clients: ClientOption[] = contacts.map((c) => ({
    id: c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/facturas`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura</h1>
      </div>
      <ManualInvoiceForm projectId={projectId} clients={clients} />
    </div>
  );
}
