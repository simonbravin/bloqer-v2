import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoleManager } from "@/features/directory/components/role-manager";
import { getCurrentUser } from "@/lib/auth";
import { can, formatIvaConditionLabel } from "@bloqer/domain";
import { serializeMoney } from "@bloqer/utils";
import { getContactById, ServiceError } from "@bloqer/services";
import { ContactArchiveActions } from "@/features/directory/components/contact-archive-actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { PageListHeader } from "@/components/ui/page-list-header";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import { ContactStatusBadge } from "@/features/directory/components/contact-status-badge";

const TAX_ID_LABELS: Record<string, string> = {
  CUIT: "CUIT", CUIL: "CUIL", CDI: "CDI", FOREIGN: "ID extranjero", FINAL_CONSUMER: "Consumidor final",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactoDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
  const canEdit = can(ctx.roles, "EDIT", "DIRECTORY");

  let contact;
  try {
    contact = await getContactById(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  const canEditRoles = canEdit && contact.status === "ACTIVE";

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={contact.fantasyName ?? contact.legalName}>
      {/* Header */}
      <PageListHeader
        title={contact.legalName}
        subtitle={contact.fantasyName ?? undefined}
        actions={<>
          <ContactStatusBadge status={contact.status} />
          {canEdit ? <Button variant="outline" size="sm" asChild>
            <Link href={`/directorio/${id}/editar`}>Editar</Link>
          </Button> : null}
          {canEdit ? <ContactArchiveActions contactId={id} status={contact.status} /> : null}
        </>}
      />

      {/* General data */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Datos generales</h2>
        </div>
        <DetailFieldGrid className="px-6 py-4">
          <DetailField label="CUIT / ID Fiscal">{contact.taxId ?? "—"}</DetailField>
          <DetailField label="Tipo ID">{contact.taxIdType ? TAX_ID_LABELS[contact.taxIdType] ?? contact.taxIdType : "—"}</DetailField>
          <DetailField label="Condición frente al IVA">{formatIvaConditionLabel(contact.ivaCondition)}</DetailField>
          <DetailField label="País">{contact.country ?? "—"}</DetailField>
          <DetailField label="Email">{contact.email ?? "—"}</DetailField>
          <DetailField label="Teléfono">{contact.phone ?? "—"}</DetailField>
          <DetailField label="Dirección" fullWidth>
              {[contact.address, contact.city, contact.province].filter(Boolean).join(", ") || "—"}
          </DetailField>
          {contact.notes && (
            <DetailField label="Notas" fullWidth><span className="whitespace-pre-wrap">{contact.notes}</span></DetailField>
          )}
        </DetailFieldGrid>
      </div>

      {/* Roles */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Un mismo contacto puede ser cliente y proveedor a la vez.{canEditRoles ? " Asigná o quitá roles acá." : ""}
          </p>
        </div>
        <div className="px-6 py-4">
          <RoleManager
            contactId={id}
            canEdit={canEditRoles}
            roles={contact.roles.map((r) => ({
              id: r.id,
              role: r.role,
              status: r.status,
            }))}
            clientProfile={
              contact.clientProfile
                ? {
                    paymentTermsDays: contact.clientProfile.paymentTermsDays,
                    defaultCurrency: contact.clientProfile.defaultCurrency,
                    creditLimit:
                      contact.clientProfile.creditLimit != null
                        ? serializeMoney(contact.clientProfile.creditLimit.toString())
                        : null,
                    notes: contact.clientProfile.notes,
                  }
                : null
            }
            supplierProfile={
              contact.supplierProfile
                ? {
                    paymentTermsDays: contact.supplierProfile.paymentTermsDays,
                    defaultCurrency: contact.supplierProfile.defaultCurrency,
                    bankAccount: contact.supplierProfile.bankAccount,
                    notes: contact.supplierProfile.notes,
                  }
                : null
            }
            subcontractorProfile={
              contact.subcontractorProfile
                ? {
                    specialty: contact.subcontractorProfile.specialty,
                    notes: contact.subcontractorProfile.notes,
                  }
                : null
            }
          />
        </div>
      </div>
    </PageShell>
  );
}
