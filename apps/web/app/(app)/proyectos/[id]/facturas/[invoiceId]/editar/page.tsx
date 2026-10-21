import { notFound, redirect } from "next/navigation";
import { can, fiscalDocumentKindLabel, type InvoiceLetterCode } from "@bloqer/domain";
import { InvoiceEditForm } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import {
  getCompanyById,
  getContactById,
  getReceivableBySalesInvoiceId,
  getSalesInvoiceById,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

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
  if (!can(current.tenantCtx.roles, "EDIT", "AR")) {
    redirect(`/proyectos/${id}/facturas/${invoiceId}`);
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getSalesInvoiceById(invoiceId, ctx, id);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const kindLabel = fiscalDocumentKindLabel(invoice.documentKind);

  if (invoice.status !== "DRAFT") {
    return (
      <PageShell variant="default" className="space-y-4" breadcrumbLabel={invoice.code}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Editar {kindLabel.toLowerCase()}</h1>
        </div>
        <p className="rounded border bg-card p-4 text-sm text-muted-foreground">
          Solo se pueden editar comprobantes en estado <strong>Borrador</strong>. Este está en
          estado &quot;{invoice.status}&quot;.
        </p>
      </PageShell>
    );
  }

  let maxCreditAmount: string | null = null;
  if (invoice.documentKind === "CREDIT_NOTE" && invoice.referencedSalesInvoiceId) {
    try {
      const parentReceivable = await getReceivableBySalesInvoiceId(
        invoice.referencedSalesInvoiceId,
        ctx,
        id,
      );
      maxCreditAmount = parentReceivable?.balanceDue ?? null;
    } catch {
      /* optional */
    }
  }

  let companyCountry: string | null = null;
  let clientCountry: string | null = null;
  try {
    const company = await getCompanyById(invoice.companyId, ctx);
    companyCountry = company.country;
  } catch { /* optional */ }
  try {
    const client = await getContactById(invoice.clientContactId, ctx);
    clientCountry = client.country;
  } catch { /* optional */ }

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar {kindLabel.toLowerCase()}</h1>
          <p className="text-sm text-muted-foreground font-mono">{invoice.code}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <InvoiceEditForm
          projectId={id}
          invoiceId={invoiceId}
          companyCountry={companyCountry}
          clientCountry={clientCountry}
          documentKind={invoice.documentKind}
          maxCreditAmount={maxCreditAmount}
          currency={invoice.currency}
          defaults={{
            issueDate: toDateInput(invoice.issueDate),
            dueDate: toDateInput(invoice.dueDate),
            notes: invoice.notes ?? "",
            internalNotes: invoice.internalNotes ?? "",
            invoiceLetter: (invoice.invoiceLetter as InvoiceLetterCode | null) ?? null,
            iibbPerceptionRate: invoice.iibbPerceptionRate,
            subtotal: invoice.subtotal,
            lines: invoice.lines.map((l) => ({
              id: l.id,
              originalMoney: { quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, discountPct: l.discountPct ?? "0", lineSubtotal: l.lineSubtotal, lineTax: l.lineTax, lineTotal: l.lineTotal },
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
              discountPct: l.discountPct ?? "0",
            })),
          }}
        />
      </div>
    </PageShell>
  );
}
