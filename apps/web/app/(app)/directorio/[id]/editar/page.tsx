import { notFound, redirect } from "next/navigation";
import { ContactForm } from "@/features/directory/components/contact-form";
import { getCurrentUser } from "@/lib/auth";
import { getContactById, ServiceError } from "@bloqer/services";
import { updateContactAction } from "../../actions";
import type { CreateContactInput } from "@bloqer/validators";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarContactoPage({ params }: PageProps) {
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const handleUpdate = async (data: CreateContactInput) => {
    "use server";
    return updateContactAction(id, data);
  };

  return (
    <PageShell variant="form" className="space-y-6" breadcrumbLabel={contact.fantasyName ?? contact.legalName}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Editar contacto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ContactForm
          onSubmit={handleUpdate}
          submitLabel="Guardar cambios"
          successRedirect={`/directorio/${id}`}
          defaultValues={{
            legalName: contact.legalName,
            fantasyName: contact.fantasyName ?? undefined,
            taxId: contact.taxId ?? undefined,
            taxIdType: contact.taxIdType ?? undefined,
            address: contact.address ?? undefined,
            city: contact.city ?? undefined,
            province: contact.province ?? undefined,
            phone: contact.phone ?? undefined,
            email: contact.email ?? undefined,
            notes: contact.notes ?? undefined,
          }}
        />
      </div>
    </PageShell>
  );
}
