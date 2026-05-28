import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { listPlatformAuditLog, listPlatformTenants, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  platformAuditActionLabel,
  PLATFORM_AUDIT_ACTION_LABEL_ES,
} from "@/features/platform/platform-audit-labels";

interface PageProps {
  searchParams: Promise<{ tenantId?: string; action?: string; limit?: string }>;
}

function formatMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return "—";
  try {
    const s = JSON.stringify(metadata);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "—";
  }
}

export default async function PlatformRegistroPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ctx = await getPlatformServiceContext(session.user.id);
  const sp = await searchParams;
  const tenantId = sp.tenantId?.trim() || undefined;
  const action = sp.action?.trim() || undefined;
  const limitRaw = sp.limit ? Number(sp.limit) : undefined;

  let rows;
  let tenants;
  try {
    [rows, tenants] = await Promise.all([
      listPlatformAuditLog(
        {
          targetTenantId: tenantId,
          action,
          limit: limitRaw && !Number.isNaN(limitRaw) ? limitRaw : 80,
        },
        ctx,
      ),
      listPlatformTenants({ limit: 200 }, ctx),
    ]);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "FORBIDDEN") redirect("/dashboard");
    throw e;
  }

  const actionOptions = Object.keys(PLATFORM_AUDIT_ACTION_LABEL_ES);

  return (
    <PageShell variant="wide" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registro de actividad</h1>
        <p className="text-sm text-muted-foreground">
          Acciones realizadas por superadmins de plataforma: quién, qué, sobre qué organización y cuándo.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4" method="get">
        <div className="grid min-w-[200px] gap-1">
          <label htmlFor="tenantId" className="text-xs text-muted-foreground">
            Organización
          </label>
          <select
            id="tenantId"
            name="tenantId"
            defaultValue={tenantId ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-[220px] gap-1">
          <label htmlFor="action" className="text-xs text-muted-foreground">
            Acción
          </label>
          <select
            id="action"
            name="action"
            defaultValue={action ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {platformAuditActionLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid w-24 gap-1">
          <label htmlFor="limit" className="text-xs text-muted-foreground">
            Límite
          </label>
          <Input id="limit" name="limit" type="number" min={1} max={200} defaultValue={limitRaw ?? 80} />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Organización</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Sin registros para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{row.actorEmail}</div>
                    {row.actorName ? (
                      <div className="text-xs text-muted-foreground">{row.actorName}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{platformAuditActionLabel(row.action)}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{row.action}</div>
                  </TableCell>
                  <TableCell>
                    {row.targetTenantId ? (
                      <Link
                        href={`/platform/tenants/${row.targetTenantId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {row.targetTenantName ?? row.targetTenantId}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-[10px] text-muted-foreground">
                    {formatMetadata(row.metadata)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
