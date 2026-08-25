import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoleManager } from "@/features/directory/components/role-manager";
import { getCurrentUser } from "@/lib/auth";
import { formatIvaConditionLabel } from "@bloqer/domain";
import { getContactById, ServiceError } from "@bloqer/services";
import { ContactArchiveActions } from "@/features/directory/components/contact-archive-actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

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

  let contact;
  try {
    contact = await getContactById(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={contact.fantasyName ?? contact.legalName}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{contact.legalName}</h1>
            {contact.fantasyName && (
              <p className="text-sm text-muted-foreground">{contact.fantasyName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              contact.status === "ACTIVE"
                ? "text-xs font-medium text-green-700"
                : "text-xs font-medium text-muted-foreground"
            }
          >
            {contact.status === "ACTIVE" ? "Activo" : "Archivado"}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/directorio/${id}/editar`}>Editar</Link>
          </Button>
          <ContactArchiveActions contactId={id} status={contact.status} />
        </div>
      </div>

      {/* Roles */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Un mismo contacto puede ser cliente y proveedor a la vez. Asigná o quitá roles acá.
          </p>
        </div>
        <div className="px-6 py-4">
          <RoleManager
            contactId={id}
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
                        ? contact.clientProfile.creditLimit.toString()
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

      {/* General data */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Datos generales</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">CUIT / ID Fiscal</dt>
            <dd className="font-medium">{contact.taxId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tipo ID</dt>
            <dd className="font-medium">{contact.taxIdType ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Condición frente al IVA</dt>
            <dd className="font-medium">{formatIvaConditionLabel(contact.ivaCondition)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">País</dt>
            <dd className="font-medium">{contact.country ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{contact.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Teléfono</dt>
            <dd className="font-medium">{contact.phone ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Dirección</dt>
            <dd className="font-medium">
              {[contact.address, contact.city, contact.province].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          {contact.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{contact.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </PageShell>
  );
}
