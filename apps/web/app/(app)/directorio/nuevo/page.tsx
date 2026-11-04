import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getTenantModuleGate } from "@bloqer/services";
import { ContactForm } from "@/features/directory/components/contact-form";
import { getCurrentUser } from "@/lib/auth";
import { createContactAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { contactRoleTypeSchema } from "@bloqer/validators";
import type { ContactRoleType } from "@bloqer/database";

interface PageProps {
  searchParams: Promise<{ role?: string }>;
}

export default async function NuevoContactoPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "DIRECTORY")) redirect("/directorio");
  const gate = await getTenantModuleGate({
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  });
  if (!gate.isEnabled("DIRECTORY")) redirect("/dashboard");
  const sp = await searchParams;
  const initialRole = contactRoleTypeSchema.safeParse(sp.role).success
    ? (sp.role as ContactRoleType)
    : undefined;

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader title="Nuevo contacto" />

      <div className="rounded-lg border bg-card p-6">
        <ContactForm
          mode="create"
          onSubmit={createContactAction}
          defaultValues={{ country: "AR", ...(initialRole ? { initialRole } : {}) }}
        />
      </div>
    </PageShell>
  );
}
