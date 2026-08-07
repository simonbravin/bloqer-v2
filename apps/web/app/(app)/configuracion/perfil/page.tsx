import { redirect } from "next/navigation";
import { getUserById } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserProfileForm } from "@/components/configuracion/user-profile-form";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";

export default async function ConfiguracionPerfilPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!current.session.user?.id) redirect("/login");

  const user = await getUserById(current.session.user.id);
  if (!user) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Mi perfil"
        subtitle="Datos personales de tu cuenta (no reemplazan la configuración del tenant)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacto</CardTitle>
        </CardHeader>
        <CardContent>
          <UserProfileForm defaultName={user.name} email={user.email} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
