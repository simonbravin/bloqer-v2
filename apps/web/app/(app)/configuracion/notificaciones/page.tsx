import { redirect } from "next/navigation";
import {
  isMissingNotificationEmailPrefsSchema,
  listMyNotificationEmailPreferences,
  ServiceError,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { NotificationEmailPreferencesForm } from "@/features/notifications/components/notification-email-preferences-form";

export default async function ConfiguracionNotificacionesPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const showLeadershipPolicyLink = current.tenantCtx.roles.some(
    (r) => r === "OWNER" || r === "ADMIN",
  );

  let preferences: Awaited<ReturnType<typeof listMyNotificationEmailPreferences>>["preferences"] =
    [];
  let loadError: string | null = null;
  let missingSchema = false;

  try {
    const result = await listMyNotificationEmailPreferences(ctx);
    preferences = result.preferences;
  } catch (err) {
    if (isMissingNotificationEmailPrefsSchema(err)) {
      missingSchema = true;
    } else if (err instanceof ServiceError) {
      loadError = err.message;
    } else {
      loadError = "No se pudieron cargar las preferencias de email.";
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Notificaciones por email"
        subtitle="Elegí qué avisos querés recibir por correo. La campana in-app no cambia."
      />

      {missingSchema ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <p className="font-medium">Falta aplicar la migración de base de datos (D-114)</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            Esta pantalla necesita las tablas de preferencias de email. Corré{" "}
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">pnpm db:migrate:deploy</code>{" "}
            contra la base de este entorno y volvé a cargar.
          </p>
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      ) : preferences.length === 0 ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          Tu rol no tiene categorías de email configurables. Los avisos de cuenta (invitar,
          verificar, restablecer contraseña) siempre se envían.
        </div>
      ) : (
        <NotificationEmailPreferencesForm
          preferences={preferences}
          showLeadershipPolicyLink={showLeadershipPolicyLink}
        />
      )}
    </PageShell>
  );
}
