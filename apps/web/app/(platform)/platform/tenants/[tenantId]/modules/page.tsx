import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import {
  listPlatformTenantModuleRows,
  summarizePlatformTenantModuleCoverage,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { updatePlatformTenantModuleAction } from "@/app/(platform)/platform-actions";

interface PageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function PlatformTenantModulesPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);

  let rows;
  try {
    rows = await listPlatformTenantModuleRows(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const coverage = summarizePlatformTenantModuleCoverage(rows);

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Módulos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Habilitación por organización. Los usuarios del tenant no pueden cambiar estos valores.
        </p>
      </div>

      <div
        role="note"
        className="space-y-2 rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
      >
        <p className="font-medium text-foreground">Comportamiento actual (default-on)</p>
        <p>
          Si un módulo <strong className="text-foreground">no tiene fila</strong> en{" "}
          <code className="text-xs">TenantModuleSetting</code>, se considera{" "}
          <strong className="text-foreground">habilitado</strong>. Guardar desde esta pantalla crea o
          actualiza una fila explícita. Los tenants nuevos ya se provisionan con filas explícitas para
          todo el catálogo.
        </p>
        <p>
          Cobertura de este tenant:{" "}
          <strong className="text-foreground">
            {coverage.explicitRows}/{coverage.totalModules}
          </strong>{" "}
          filas explícitas
          {coverage.missingRows > 0
            ? ` (${coverage.missingRows} aún en default-on sin fila). Una auditoría masiva de tenants existentes queda para una etapa posterior; no se cambia la semántica global a default-off.`
            : " (completo)."}
        </p>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              <TableHead className="font-mono text-xs">moduleKey</TableHead>
              <TableHead>Fila</TableHead>
              <TableHead>Estado y notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.moduleKey}>
                <TableCell className="align-top font-medium">{row.label}</TableCell>
                <TableCell className="align-top font-mono text-xs text-muted-foreground">
                  {row.moduleKey}
                </TableCell>
                <TableCell className="align-top text-xs text-muted-foreground">
                  {row.hasExplicitRow ? (
                    <span className="text-foreground">Explícita</span>
                  ) : (
                    <span title="Sin fila en DB: habilitado por default-on">Default-on</span>
                  )}
                </TableCell>
                <TableCell>
                  <form action={updatePlatformTenantModuleAction} className="flex max-w-xl flex-col gap-2">
                    <input type="hidden" name="tenantId" value={tenantId} />
                    <input type="hidden" name="moduleKey" value={row.moduleKey} />
                    <select
                      name="isEnabled"
                      defaultValue={row.isEnabled ? "true" : "false"}
                      className="flex h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="true">Habilitado</option>
                      <option value="false">Deshabilitado</option>
                    </select>
                    <Textarea
                      name="internalNotes"
                      defaultValue={row.internalNotes ?? ""}
                      placeholder="Notas internas (solo plataforma)"
                      rows={2}
                      className="text-sm"
                    />
                    <Button type="submit" size="sm" variant="secondary" className="w-fit">
                      Guardar
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
