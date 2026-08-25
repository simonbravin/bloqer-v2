import { ContactForm } from "@/features/directory/components/contact-form";
import { createContactAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { contactRoleTypeSchema } from "@bloqer/validators";
import type { ContactRoleType } from "@bloqer/database";

interface PageProps {
  searchParams: Promise<{ role?: string }>;
}

export default async function NuevoContactoPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const initialRole = contactRoleTypeSchema.safeParse(sp.role).success
    ? (sp.role as ContactRoleType)
    : undefined;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo contacto</h1>
      </div>

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
