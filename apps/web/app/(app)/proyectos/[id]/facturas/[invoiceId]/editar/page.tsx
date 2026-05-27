import { notFound, redirect } from "next/navigation";
import { InvoiceEditForm } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { getSalesInvoiceById, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string; invoiceId: string }>;
}

function toDateInput(d: Date): string {
  return new Date(d).toISOString().split("T")[0]!;
}

export default async function EditarFacturaPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, invoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getSalesInvoiceById(invoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (invoice.status !== "DRAFT") {
    return (
      <PageShell variant="form" className="space-y-4">
        <div className="flex items-center gap-4">
          <PageBackLink href={`/proyectos/${id}/facturas/${invoiceId}`} label="Volver" />
          <h1 className="text-2xl font-bold tracking-tight">Editar factura</h1>
        </div>
        <p className="rounded border bg-card p-4 text-sm text-muted-foreground">
          Solo se pueden editar facturas en estado <strong>Borrador</strong>. Esta factura está en
          estado &quot;{invoice.status}&quot;.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/facturas/${invoiceId}`} label="Volver" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar factura</h1>
          <p className="text-sm text-muted-foreground font-mono">{invoice.code}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <InvoiceEditForm
          projectId={id}
          invoiceId={invoiceId}
          defaults={{
            issueDate: toDateInput(invoice.issueDate),
            dueDate: toDateInput(invoice.dueDate),
            notes: invoice.notes ?? "",
            internalNotes: invoice.internalNotes ?? "",
          }}
        />
      </div>
    </PageShell>
  );
}
