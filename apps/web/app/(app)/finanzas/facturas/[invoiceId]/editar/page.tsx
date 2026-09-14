import { notFound, redirect } from "next/navigation";
import { fiscalDocumentKindLabel, type InvoiceLetterCode } from "@bloqer/domain";
import { InvoiceEditForm } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditCompanyAr,
  getCompanyById,
  getCompanySalesInvoiceById,
  getContactById,
  getReceivableBySalesInvoiceId,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

function toDateInput(d: Date): string {
  return new Date(d).toISOString().split("T")[0]!;
}

export default async function EditarFacturaVentaCorporativaPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { invoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!canEditCompanyAr(ctx.roles)) {
    redirect(`/finanzas/facturas/${invoiceId}`);
  }

  let invoice;
  try {
    invoice = await getCompanySalesInvoiceById(invoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  if (invoice.projectId) {
    redirect(`/proyectos/${invoice.projectId}/facturas/${invoiceId}/editar`);
  }

  const kindLabel = fiscalDocumentKindLabel(invoice.documentKind);

  if (invoice.status !== "DRAFT") {
    redirect(`/finanzas/facturas/${invoiceId}`);
  }

  let maxCreditAmount: string | null = null;
  if (invoice.documentKind === "CREDIT_NOTE" && invoice.referencedSalesInvoiceId) {
    try {
      const parentReceivable = await getReceivableBySalesInvoiceId(
        invoice.referencedSalesInvoiceId,
        ctx,
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
  } catch {
    /* optional */
  }
  try {
    const client = await getContactById(invoice.clientContactId, ctx);
    clientCountry = client.country;
  } catch {
    /* optional */
  }

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
          companyFinanzas
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
