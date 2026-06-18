import { ContactForm } from "@/features/directory/components/contact-form";
import { createContactAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";

export default function NuevoContactoPage() {
  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo contacto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ContactForm onSubmit={createContactAction} defaultValues={{ initialRole: "CLIENT" }} />
      </div>
    </PageShell>
  );
}
