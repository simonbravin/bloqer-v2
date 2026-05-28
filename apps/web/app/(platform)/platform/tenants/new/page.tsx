import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { PageShell } from "@/components/layout/page-shell";
import { CompanyOnboardingFields } from "@/features/platform";
import { provisionPlatformTenantAction } from "@/app/(platform)/platform-provision-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ err?: string }>;
}

export default async function PlatformTenantsNewPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sp = await searchParams;
  let errMsg: string | null = null;
  if (sp.err) {
    try {
      errMsg = decodeURIComponent(sp.err);
    } catch {
      errMsg = sp.err;
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/platform/tenants">← Organizaciones</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Crear organización</h1>
        <p className="text-sm text-muted-foreground">
          Alta de tenant en trial, empresa principal e invitación al administrador.
        </p>
      </div>
      {errMsg ? (
        <p className="text-sm text-destructive" role="alert">
          {errMsg}
        </p>
      ) : null}
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Datos de la organización</CardTitle>
          <CardDescription>
            El contacto recibirá un enlace para aceptar la invitación con rol OWNER.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={provisionPlatformTenantAction} className="space-y-4">
            <CompanyOnboardingFields showOwnerEmail />
            <Button type="submit" className="w-full">
              Crear e invitar administrador
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
