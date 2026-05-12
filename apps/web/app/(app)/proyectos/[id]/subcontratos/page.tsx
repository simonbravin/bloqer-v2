import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listSubcontractsByProject, ServiceError } from "@bloqer/services";
import { SubcontractStatusBadge } from "@/features/subcontracts";

interface PageProps { params: Promise<{ id: string }> }

export default async function SubcontratosPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let subcontracts;
  try {
    subcontracts = await listSubcontractsByProject(projectId, ctx);
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
          <h1 className="text-2xl font-bold tracking-tight">Subcontratos</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${projectId}/subcontratos/nuevo`}>+ Nuevo subcontrato</Link>
        </Button>
      </div>

      {subcontracts.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          No hay subcontratos en este proyecto.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Subcontratista</th>
                <th className="px-4 py-3 text-right">Valor total</th>
                <th className="px-4 py-3 text-right">Certificado</th>
                <th className="px-4 py-3 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {subcontracts.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/proyectos/${projectId}/subcontratos/${s.id}`} className="hover:underline text-primary">
                      {s.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/proyectos/${projectId}/subcontratos/${s.id}`} className="hover:underline">
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.subcontractorName}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {parseFloat(s.totalValue).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {parseFloat(s.totalCertified).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3"><SubcontractStatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
