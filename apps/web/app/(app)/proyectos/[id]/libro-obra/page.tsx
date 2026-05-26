import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listJobsiteLogsByProject, ServiceError } from "@bloqer/services";
import { JobsiteLogStatusBadge } from "@/features/jobsite-log";

interface PageProps { params: Promise<{ id: string }> }

export default async function LibroObraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let logs;
  try {
    logs = await listJobsiteLogsByProject(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}`}>← Proyecto</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Libro de obra</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${projectId}/libro-obra/nuevo`}>+ Nuevo parte</Link>
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          No hay partes de obra registrados en este proyecto.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Título / Frente</th>
                <th className="px-4 py-3 text-left">Turno</th>
                <th className="px-4 py-3 text-center">Avances</th>
                <th className="px-4 py-3 text-center">MO</th>
                <th className="px-4 py-3 text-center">Mat.</th>
                <th className="px-4 py-3 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/proyectos/${projectId}/libro-obra/${l.id}`} className="hover:underline text-primary">
                      {formatDate(l.logDate)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/proyectos/${projectId}/libro-obra/${l.id}`} className="hover:underline">
                      {l.title ?? l.workFront ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.shift ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{l.progress.length}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{l.labor.length}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{l.materials.length}</td>
                  <td className="px-4 py-3">
                    <JobsiteLogStatusBadge status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
