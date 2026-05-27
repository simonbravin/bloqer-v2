import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoleManager } from "@/features/directory/components/role-manager";
import { getCurrentUser } from "@/lib/auth";
import { getContactById, ServiceError } from "@bloqer/services";
import { archiveContactAction, reactivateContactAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
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

  const doArchive = async () => {
    "use server";
    await archiveContactAction(id);
  };
  const doReactivate = async () => {
    "use server";
    await reactivateContactAction(id);
  };

  let contact;
  try {
    contact = await getContactById(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="detail" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href="/directorio" label="Volver" />
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
          {contact.status === "ACTIVE" ? (
            <form action={doArchive}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Archivar
              </Button>
            </form>
          ) : (
            <form action={doReactivate}>
              <Button variant="ghost" size="sm">
                Reactivar
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Roles */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Roles</h2>
        </div>
        <div className="px-6 py-4">
          <RoleManager
            contactId={id}
            roles={contact.roles}
            clientProfile={contact.clientProfile}
            supplierProfile={contact.supplierProfile}
            subcontractorProfile={contact.subcontractorProfile}
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
