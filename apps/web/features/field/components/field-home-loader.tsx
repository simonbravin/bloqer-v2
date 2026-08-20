import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getFieldHome } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { LAST_PROJECT_COOKIE, isProjectIdValue } from "@/lib/last-project-cookie";
import { getCachedFieldPendingCounts } from "@/lib/rsc-cached-tenant";
import { MobileFieldHome, ClearStaleLastProjectCookie } from "./mobile-field-home";
import { FieldHomeSkeleton } from "./field-home-skeleton";

export async function FieldHomeLoader() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const jar = await cookies();
  const raw = jar.get(LAST_PROJECT_COOKIE)?.value ?? null;
  const preferred = isProjectIdValue(raw) ? raw : null;

  const home = await getFieldHome(ctx, {
    preferredProjectId: preferred,
    pendingCounts: await getCachedFieldPendingCounts(ctx),
  });

  if (home.projects.length === 0) {
    return (
      <div className="space-y-3" data-testid="field-home-corporate">
        <ClearStaleLastProjectCookie />
        <h1 className="text-xl font-semibold">Inicio</h1>
        <p className="text-sm text-muted-foreground">
          No hay obras operativas. El tablero corporativo está en escritorio.
        </p>
      </div>
    );
  }

  return <MobileFieldHome home={home} />;
}

export function FieldHomeFallback() {
  return <FieldHomeSkeleton />;
}
