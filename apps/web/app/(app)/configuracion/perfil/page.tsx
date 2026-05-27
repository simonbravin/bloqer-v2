import { redirect } from "next/navigation";
import { getUserById } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserProfileForm } from "@/components/configuracion/user-profile-form";
import { PageShell } from "@/components/layout/page-shell";

export default async function ConfiguracionPerfilPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!current.session.user?.id) redirect("/login");

  const user = await getUserById(current.session.user.id);
  if (!user) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">Datos personales de tu cuenta (no reemplazan la configuración del tenant).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacto</CardTitle>
          <CardDescription>Nombre visible en la app y en auditoría.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserProfileForm defaultName={user.name} email={user.email} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
