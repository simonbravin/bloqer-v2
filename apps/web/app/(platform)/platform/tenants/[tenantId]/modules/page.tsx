import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import {
  listPlatformTenantModuleRows,
  ServiceError,
} from "@bloqer/services";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { updatePlatformTenantModuleAction } from "@/app/(platform)/platform-actions";

interface PageProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}

export default async function PlatformTenantModulesPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const sp = await searchParams;
  const ctx = await getPlatformServiceContext(session.user.id);

  let rows;
  try {
    rows = await listPlatformTenantModuleRows(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/platform/tenants/${tenantId}`}>← Tenant</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Módulos del tenant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo operadores de plataforma. Los usuarios del tenant no pueden cambiar estos valores (Phase 12B).
        </p>
      </div>

      {sp.err ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decodeURIComponent(sp.err)}
        </p>
      ) : null}
      {sp.ok ? (
        <p className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-200">
          Guardado.
        </p>
      ) : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              <TableHead className="font-mono text-xs">moduleKey</TableHead>
              <TableHead>Estado y notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.moduleKey}>
                <TableCell className="font-medium align-top">{row.label}</TableCell>
                <TableCell className="align-top font-mono text-xs text-muted-foreground">{row.moduleKey}</TableCell>
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
                    <p className="text-xs text-muted-foreground">
                      Sin registro en base = habilitado por defecto para no romper tenants existentes.
                    </p>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
