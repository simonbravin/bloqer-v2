import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/features/directory/components/contact-form";
import { createContactAction } from "../actions";

export default function NuevoContactoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/directorio">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo contacto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ContactForm onSubmit={createContactAction} />
      </div>
    </div>
  );
}
