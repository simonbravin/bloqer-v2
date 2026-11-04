import Link from "next/link";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-workspace p-4 text-workspace-foreground">
      <div className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 sm:p-8">
        <BloqerLogo className="h-9 max-w-[10rem]" />
        <p className="text-sm font-medium text-muted-foreground">Página no disponible</p>
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
        <p className="text-sm text-muted-foreground">
          Revisá la dirección o volvé al inicio para continuar. Si necesitás acceder a una sección
          que no aparece, pedile a un administrador que revise tus permisos.
        </p>
        <Button asChild><Link href="/dashboard">Ir al inicio</Link></Button>
      </div>
    </main>
  );
}
